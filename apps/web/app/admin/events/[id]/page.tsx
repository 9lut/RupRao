"use client";

import Link from "next/link";
import { Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useConfirm } from "@/components/Confirm";
import EventSettings from "@/components/EventSettings";
import Gallery, { GallerySkeleton, useSelection } from "@/components/Gallery";
import Lightbox from "@/components/Lightbox";
import SelectionBar from "@/components/SelectionBar";
import ShareCard from "@/components/ShareCard";
import UploadPanel from "@/components/UploadPanel";
import { adminApi, type AdminEvent, type AdminPhoto, type PhotoStatus, type RemovalRequest } from "@/lib/api";

const STATUS: Record<PhotoStatus, { label: string; dot: string }> = {
  PENDING: { label: "รอสแกน", dot: "bg-[#c9c9c9]" },
  PROCESSING: { label: "กำลังสแกน", dot: "bg-amber-400 animate-pulse" },
  PROCESSED: { label: "สแกนแล้ว", dot: "bg-emerald-500" },
  FAILED: { label: "ล้มเหลว", dot: "bg-red-500" },
};

type Tab = "photos" | "share" | "settings" | "requests";

const TABS: Tab[] = ["photos", "share", "settings", "requests"];

export default function AdminEventPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <EventDetail params={params} />
    </Suspense>
  );
}

function EventDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const search = useSearchParams();
  const confirm = useConfirm();
  const [event, setEvent] = useState<AdminEvent | null>(null);
  const [photos, setPhotos] = useState<AdminPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialTab = search.get("tab") as Tab;
  const [tab, setTabState] = useState<Tab>(TABS.includes(initialTab) ? initialTab : "photos");
  const [justCreated, setJustCreated] = useState(search.get("created") === "1");
  const setTab = (t: Tab) => {
    setTabState(t);
    router.replace(`/admin/events/${id}${t === "photos" ? "" : `?tab=${t}`}`, { scroll: false });
  };

  const load = useCallback(async () => {
    try {
      const [ev, ph] = await Promise.all([adminApi.getEvent(id), adminApi.listPhotos(id)]);
      setEvent(ev);
      // Presigned URLs change on every request; keep existing ones so images don't reload while polling.
      setPhotos((prev) => {
        const known = new Map(prev?.map((p) => [p.id, p]));
        return ph.map((p) => {
          const old = known.get(p.id);
          return old ? { ...p, url: old.url, thumbnail_url: old.thumbnail_url } : p;
        });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const pending = event?.pending_count ?? 0;
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [pending, load]);

  const deleteEvent = async () => {
    if (!event) return;
    const ok = await confirm({
      title: "ลบอีเวนต์นี้ถาวร?",
      message: "การลบไม่สามารถย้อนกลับได้ และลิงก์/QR ของงานนี้จะใช้ไม่ได้ทันที",
      details: [
        `รูปทั้งหมด ${event.photo_count.toLocaleString()} รูป (ต้นฉบับและรูปย่อ)`,
        `ข้อมูลใบหน้า ${event.face_count.toLocaleString()} รายการ`,
        "คำขอลบรูปทั้งหมดของงานนี้",
      ],
      requireText: event.name,
      confirmLabel: "ลบอีเวนต์ถาวร",
      tone: "danger",
    });
    if (!ok) return;
    await adminApi.deleteEvent(id);
    router.push("/admin");
  };

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6">
        <p className="font-medium">{error}</p>
        <Link href="/admin" className="mt-3 inline-block text-sm text-muted hover:text-ink">← กลับ</Link>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "photos", label: "รูปภาพ", badge: photos?.length },
    { key: "share", label: "แชร์ / QR" },
    { key: "settings", label: "ตั้งค่า" },
    { key: "requests", label: "คำขอลบ", badge: event?.pending_removals || undefined },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-8 sm:px-6">
      <Link href="/admin" className="text-sm text-muted hover:text-ink">← อีเวนต์ทั้งหมด</Link>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{event?.name ?? "…"}</h1>
          {event && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              {event.photo_count.toLocaleString()} รูป · {event.face_count.toLocaleString()} ใบหน้า · ความแม่นยำ{" "}
              {Math.round(event.effective_threshold * 100)}%
              {pending > 0 && (
                <span className="inline-flex items-center gap-1.5 text-ink">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                  กำลังสแกน {pending} รูป
                </span>
              )}
            </p>
          )}
        </div>
        <button onClick={deleteEvent} className="self-start rounded-full border border-line px-4 py-2 text-sm text-muted transition hover:border-red-200 hover:text-red-600 sm:self-auto">
          ลบอีเวนต์
        </button>
      </div>

      {justCreated && (
        <div className="fade-in mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-emerald-200 bg-emerald-50/60 p-5">
          <div>
            <p className="font-semibold">สร้างอีเวนต์แล้ว 🎉</p>
            <p className="mt-1 text-sm text-muted">ขั้นต่อไป: ① อัปโหลดรูปด้านล่าง → ② รอสแกนใบหน้า → ③ แชร์ลิงก์หรือ QR ให้ผู้ร่วมงาน</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setTab("share")} className="rounded-full border border-line bg-white px-4 py-2 text-xs hover:bg-soft">
              ดู QR
            </button>
            <button onClick={() => setJustCreated(false)} className="rounded-full px-3 py-2 text-xs text-muted hover:text-ink">
              ปิด
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm transition ${
              tab === t.key ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
            {t.badge !== undefined && (
              <span className={`rounded-full px-1.5 text-[11px] ${t.key === "requests" ? "bg-amber-400 text-ink" : "bg-soft text-muted"}`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === "photos" && <PhotosTab eventId={id} event={event} photos={photos} reload={load} />}
        {tab === "share" && event && (
          <ShareCard event={event} onRotate={async () => setEvent(await adminApi.rotateLink(id))} />
        )}
        {tab === "settings" && event && <EventSettings key={event.id} event={event} onSaved={setEvent} />}
        {tab === "requests" && <RequestsTab eventId={id} onChanged={load} />}
      </div>
    </div>
  );
}

function PhotosTab({
  eventId,
  event,
  photos,
  reload,
}: {
  eventId: string;
  event: AdminEvent | null;
  photos: AdminPhoto[] | null;
  reload: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => (photos ?? []).map((photo) => ({ photo })), [photos]);
  const ids = useMemo(() => items.map((i) => i.photo.id), [items]);
  const selection = useSelection(ids);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <UploadPanel eventId={eventId} onUploaded={reload} />

      {photos && photos.length > 0 && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2 text-xs">
            {(event?.failed_count ?? 0) > 0 && (
              <button
                disabled={busy}
                onClick={() => run(() => adminApi.reprocessFailed(eventId))}
                className="rounded-full border border-red-200 px-3 py-1.5 text-red-600 hover:bg-red-50"
              >
                สแกนใหม่ {event?.failed_count} รูปที่ล้มเหลว
              </button>
            )}
            <button
              disabled={busy}
              onClick={async () =>
                (await confirm({
                  title: "สแกนใบหน้าใหม่ทุกรูป?",
                  message: `ระบบจะสแกน ${items.length.toLocaleString()} รูปใหม่ทั้งหมด ระหว่างนี้ผลค้นหาของผู้ร่วมงานอาจไม่ครบชั่วคราว`,
                  details: ["ใช้หลังปรับการตั้งค่าการตรวจจับใบหน้า", `ใช้เวลาประมาณ ${Math.max(1, Math.round((items.length * 1.3) / 60))} นาที`],
                  confirmLabel: "เริ่มสแกนใหม่",
                })) && run(() => adminApi.reprocessAll(eventId))
              }
              className="rounded-full border border-line px-3 py-1.5 text-muted hover:text-ink"
            >
              สแกนใหม่ทั้งหมด
            </button>
          </div>
          <button
            onClick={() => (selection.active ? selection.stop() : selection.start())}
            className={`rounded-full px-4 py-2 text-xs font-medium ${selection.active ? "bg-ink text-white" : "border border-line hover:bg-soft"}`}
          >
            {selection.active ? "เสร็จ" : "เลือกหลายรูป"}
          </button>
        </div>
      )}

      <div className="mt-5">
        {photos === null ? (
          <GallerySkeleton />
        ) : photos.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">ยังไม่มีรูปในอีเวนต์นี้</p>
        ) : (
          <Gallery
            items={items}
            onOpen={setOpen}
            selection={selection}
            renderOverlay={({ photo }) => {
              const p = photo as AdminPhoto;
              return (
                <>
                  <span
                    title={p.error ?? undefined}
                    className="pointer-events-none absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] text-ink shadow-sm backdrop-blur"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS[p.status].dot}`} />
                    {p.status === "PROCESSED" ? `${p.face_count} ใบหน้า` : STATUS[p.status].label}
                  </span>
                  <div className="absolute right-2.5 top-2.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
                    {p.status === "FAILED" && (
                      <button
                        onClick={() => run(() => adminApi.reprocessPhoto(p.id))}
                        className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] shadow-sm backdrop-blur hover:bg-white"
                      >
                        ลองใหม่
                      </button>
                    )}
                    <button
                      onClick={async () =>
                        (await confirm({
                          title: "ลบรูปนี้?",
                          message: "รูปและข้อมูลใบหน้าในรูปจะถูกลบถาวร ผู้ร่วมงานจะค้นหารูปนี้ไม่เจออีก",
                          confirmLabel: "ลบรูป",
                          tone: "danger",
                        })) && run(() => adminApi.deletePhoto(p.id))
                      }
                      aria-label="ลบรูป"
                      className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-sm text-muted shadow-sm backdrop-blur hover:text-red-600"
                    >
                      ×
                    </button>
                  </div>
                </>
              );
            }}
          />
        )}
      </div>

      {selection.active && (
        <SelectionBar
          count={selection.count}
          total={items.length}
          onSelectAll={selection.selectAll}
          onClear={selection.clear}
          onCancel={selection.stop}
        >
          <button
            disabled={!selection.count || busy}
            onClick={async () =>
              (await confirm({
                title: `ลบ ${selection.count} รูปที่เลือก?`,
                message: "รูปและข้อมูลใบหน้าในรูปเหล่านี้จะถูกลบถาวร ไม่สามารถย้อนกลับได้",
                confirmLabel: `ลบ ${selection.count} รูป`,
                tone: "danger",
              })) &&
              run(async () => {
                for (const pid of selection.ids()) await adminApi.deletePhoto(pid);
                selection.stop();
              })
            }
            className="rounded-full px-3 py-2 text-sm text-muted hover:text-red-600 disabled:opacity-40"
          >
            ลบ
          </button>
          <button
            disabled={!selection.count || busy}
            onClick={() => run(() => adminApi.downloadZip(eventId, selection.ids()))}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            ดาวน์โหลด
          </button>
        </SelectionBar>
      )}

      {open !== null && (
        <Lightbox
          items={items}
          index={open}
          onClose={() => setOpen(null)}
          onIndexChange={setOpen}
          onDownload={async (it) => {
            const { url } = await adminApi.downloadUrl(it.photo.id);
            window.location.href = url;
          }}
        />
      )}
    </>
  );
}

function RequestsTab({ eventId, onChanged }: { eventId: string; onChanged: () => void }) {
  const confirm = useConfirm();
  const [requests, setRequests] = useState<RemovalRequest[] | null>(null);
  const load = useCallback(() => adminApi.listRemovals(eventId).then(setRequests).catch(() => setRequests([])), [eventId]);
  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (r: RemovalRequest, action: "approve" | "reject") => {
    const ok =
      action === "approve"
        ? await confirm({
            title: `อนุมัติและลบ ${r.photos.length} รูป?`,
            message: "รูปเหล่านี้และข้อมูลใบหน้าในรูปจะถูกลบถาวร — คนอื่นที่อยู่ในรูปเดียวกันจะค้นหารูปนี้ไม่เจอด้วย",
            details: r.photos.length > 1 ? ["ถ้ามีรูปหมู่ ลองติดต่อผู้ขอก่อนว่าต้องการลบทั้งรูปจริงไหม"] : undefined,
            confirmLabel: "อนุมัติและลบ",
            tone: "danger",
          })
        : await confirm({
            title: "ปฏิเสธคำขอนี้?",
            message: r.contact ? `ควรแจ้งเหตุผลให้ผู้ขอทราบทาง ${r.contact}` : "ผู้ขอไม่ได้ทิ้งช่องทางติดต่อไว้",
            confirmLabel: "ปฏิเสธคำขอ",
          });
    if (!ok) return;
    await adminApi.resolveRemoval(r.id, action);
    load();
    onChanged();
  };

  if (!requests) return <div className="shimmer h-32 rounded-3xl" />;
  if (!requests.length) return <p className="py-16 text-center text-sm text-muted">ยังไม่มีคำขอลบรูป</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        ผู้ร่วมงานขอให้ลบรูปของตน (สิทธิ์ตาม PDPA) — อนุมัติแล้วรูปและข้อมูลใบหน้าในรูปจะถูกลบถาวร
      </p>
      {requests.map((r) => (
        <div key={r.id} className={`rounded-3xl border p-5 ${r.status === "PENDING" ? "border-amber-200" : "border-line opacity-70"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                {r.photos.length} รูป · {new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
              </p>
              <p className="mt-1 text-xs text-muted">
                ติดต่อ: {r.contact || "—"}
                {r.note && <> · {r.note}</>}
              </p>
            </div>
            {r.status === "PENDING" ? (
              <div className="flex gap-2">
                <button onClick={() => resolve(r, "reject")} className="rounded-full border border-line px-4 py-2 text-xs hover:bg-soft">
                  ปฏิเสธ
                </button>
                <button onClick={() => resolve(r, "approve")} className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-white">
                  อนุมัติและลบรูป
                </button>
              </div>
            ) : (
              <span className="rounded-full bg-soft px-3 py-1 text-xs text-muted">{r.status === "APPROVED" ? "ลบแล้ว" : "ปฏิเสธแล้ว"}</span>
            )}
          </div>
          {r.photos.length > 0 && (
            <div className="mt-4 flex gap-2 overflow-x-auto">
              {r.photos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.id} src={p.thumbnail_url ?? p.url} alt="" className="h-24 w-auto shrink-0 rounded-xl object-cover" />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
