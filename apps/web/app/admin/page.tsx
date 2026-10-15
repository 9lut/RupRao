"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi, type AdminEvent, type AdminStats } from "@/lib/api";

type Filter = "all" | "attention" | "scanning" | "expiring" | "locked" | "keep";
type Sort = "newest" | "oldest" | "name" | "photos" | "expiry";
type View = "grid" | "list";

const DAY = 86_400_000;

const FILTERS: { key: Filter; label: string; test: (e: AdminEvent) => boolean }[] = [
  { key: "all", label: "ทั้งหมด", test: () => true },
  { key: "attention", label: "ต้องดำเนินการ", test: (e) => e.pending_removals > 0 || e.failed_count > 0 },
  { key: "scanning", label: "กำลังสแกน", test: (e) => e.pending_count > 0 },
  { key: "expiring", label: "ใกล้ลบ (7 วัน)", test: (e) => !!e.expires_at && daysLeft(e.expires_at) <= 7 },
  { key: "locked", label: "มีรหัสเข้าชม", test: (e) => !!e.access_code },
  { key: "keep", label: "ไม่ลบอัตโนมัติ", test: (e) => !e.expires_at },
];

const SORTS: { key: Sort; label: string; cmp: (a: AdminEvent, b: AdminEvent) => number }[] = [
  { key: "newest", label: "สร้างล่าสุด", cmp: (a, b) => b.created_at.localeCompare(a.created_at) },
  { key: "oldest", label: "สร้างเก่าสุด", cmp: (a, b) => a.created_at.localeCompare(b.created_at) },
  { key: "name", label: "ชื่อ ก–ฮ", cmp: (a, b) => a.name.localeCompare(b.name, "th") },
  { key: "photos", label: "รูปมากสุด", cmp: (a, b) => b.photo_count - a.photo_count },
  {
    key: "expiry",
    label: "ใกล้ลบก่อน",
    cmp: (a, b) => (a.expires_at ?? "9999").localeCompare(b.expires_at ?? "9999"),
  },
];

function daysLeft(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / DAY);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { dateStyle: "medium" });
}

export default function AdminHomePage() {
  return (
    <Suspense>
      <AdminHome />
    </Suspense>
  );
}

function AdminHome() {
  const router = useRouter();
  const params = useSearchParams();
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Filters live in the URL so a filtered view can be bookmarked / shared with co-organizers.
  const q = params.get("q") ?? "";
  const filter = (params.get("filter") as Filter) || "all";
  const sort = (params.get("sort") as Sort) || "newest";
  const view = (params.get("view") as View) || "grid";
  const setParam = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === fallback || !value) next.delete(key);
    else next.set(key, value);
    router.replace(`/admin${next.toString() ? `?${next}` : ""}`, { scroll: false });
  };

  useEffect(() => {
    adminApi.listEvents().then(setEvents).catch((e) => setError(e.message));
    const loadStats = () => adminApi.stats().then(setStats).catch(() => {});
    loadStats();
    const t = setInterval(loadStats, 5000);
    return () => clearInterval(t);
  }, []);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, (events ?? []).filter(f.test).length])) as Record<Filter, number>,
    [events],
  );

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
    const s = SORTS.find((x) => x.key === sort) ?? SORTS[0];
    return (events ?? [])
      .filter((e) => f.test(e))
      .filter((e) => !term || e.name.toLowerCase().includes(term) || (e.description ?? "").toLowerCase().includes(term) || e.share_token.includes(term))
      .sort(s.cmp);
  }, [events, q, filter, sort]);

  const attention = useMemo(
    () =>
      (events ?? [])
        .flatMap((e) => {
          const items: { event: AdminEvent; text: string; tone: "warn" | "danger" | "info"; tab: string }[] = [];
          if (e.pending_removals) items.push({ event: e, text: `คำขอลบรูป ${e.pending_removals} รายการรอตรวจ`, tone: "warn", tab: "requests" });
          if (e.failed_count) items.push({ event: e, text: `สแกนไม่สำเร็จ ${e.failed_count} รูป`, tone: "danger", tab: "photos" });
          if (e.expires_at && daysLeft(e.expires_at) <= 7)
            items.push({ event: e, text: `จะถูกลบใน ${Math.max(0, daysLeft(e.expires_at))} วัน (${fmtDate(e.expires_at)})`, tone: "info", tab: "settings" });
          return items;
        })
        .slice(0, 6),
    [events],
  );

  const copyLink = async (e: AdminEvent) => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/e/${e.share_token}`);
      setCopied(e.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  const scanning = (stats?.photos_by_status.PENDING ?? 0) + (stats?.photos_by_status.PROCESSING ?? 0);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6">
      {/* ---------- header ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">อีเวนต์ของคุณ</h1>
          <p className="mt-1 text-sm text-muted">จัดการรูป แชร์ลิงก์ / QR และดูแลคำขอลบรูปของผู้ร่วมงาน</p>
        </div>
        <Link href="/admin/events/new" className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-black/80">
          <span className="text-base leading-none">+</span> สร้างอีเวนต์
        </Link>
      </div>

      {/* ---------- stats ---------- */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="อีเวนต์" value={stats?.events} />
        <Stat label="รูปทั้งหมด" value={stats?.photos} />
        <Stat label="ใบหน้า" value={stats?.faces} />
        <Stat
          label="กำลังสแกน"
          value={stats ? scanning : undefined}
          live={scanning > 0}
          hint={stats?.queue ? `คิว ${stats.queue.queued} · ล้มเหลว ${stats.queue.failed}` : stats ? "คิวไม่พร้อม" : undefined}
        />
        <Stat label="คำขอลบรอตรวจ" value={stats?.pending_removals} warn={(stats?.pending_removals ?? 0) > 0} />
      </div>

      {/* ---------- needs attention ---------- */}
      {attention.length > 0 && (
        <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50/40 p-5">
          <p className="text-sm font-semibold">ต้องดำเนินการ</p>
          <ul className="mt-3 divide-y divide-amber-100">
            {attention.map((a, i) => (
              <li key={i}>
                <Link href={`/admin/events/${a.event.id}?tab=${a.tab}`} className="flex items-center gap-3 py-2.5 text-sm hover:opacity-80">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${a.tone === "danger" ? "bg-red-500" : a.tone === "warn" ? "bg-amber-400" : "bg-accent"}`} />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{a.event.name}</span> <span className="text-muted">— {a.text}</span>
                  </span>
                  <span className="text-muted">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------- toolbar ---------- */}
      <div className="mt-10 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xs">
          <svg className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            value={q}
            onChange={(e) => setParam("q", e.target.value, "")}
            placeholder="ค้นหาชื่ออีเวนต์ หรือรหัส"
            className="w-full rounded-full border border-line bg-white py-2.5 pl-11 pr-4 text-sm outline-none transition focus:border-ink"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setParam("sort", e.target.value, "newest")}
            className="rounded-full border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-ink"
            aria-label="เรียงตาม"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                เรียง: {s.label}
              </option>
            ))}
          </select>
          <div className="flex rounded-full border border-line p-0.5" role="group" aria-label="มุมมอง">
            {(["grid", "list"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setParam("view", v, "grid")}
                aria-pressed={view === v}
                className={`rounded-full px-3 py-2 text-xs transition ${view === v ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
              >
                {v === "grid" ? "การ์ด" : "รายการ"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setParam("filter", f.key, "all")}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm transition ${
              filter === f.key ? "bg-ink text-white" : "bg-soft text-muted hover:text-ink"
            }`}
          >
            {f.label}
            {events && <span className={`text-xs tabular-nums ${filter === f.key ? "text-white/70" : ""}`}>{counts[f.key]}</span>}
          </button>
        ))}
      </div>

      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

      {/* ---------- results ---------- */}
      {events === null ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="shimmer aspect-[4/3] rounded-3xl" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyFirstEvent />
      ) : shown.length === 0 ? (
        <div className="py-20 text-center">
          <p className="font-medium">ไม่พบอีเวนต์ที่ตรงกับตัวกรอง</p>
          <button onClick={() => router.replace("/admin")} className="mt-3 text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
            ล้างตัวกรองทั้งหมด
          </button>
        </div>
      ) : view === "grid" ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((ev) => (
            <EventCard key={ev.id} ev={ev} copied={copied === ev.id} onCopy={() => copyLink(ev)} />
          ))}
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-3xl border border-line">
          <table className="w-full text-sm">
            <thead className="hidden bg-soft text-left text-xs text-muted sm:table-header-group">
              <tr>
                <th className="px-4 py-3 font-medium">อีเวนต์</th>
                <th className="px-4 py-3 text-right font-medium">รูป</th>
                <th className="px-4 py-3 text-right font-medium">ใบหน้า</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3 font-medium">ลบอัตโนมัติ</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((ev) => (
                <tr key={ev.id} className="transition hover:bg-soft/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/events/${ev.id}`} className="flex items-center gap-3">
                      <span className="h-11 w-14 shrink-0 overflow-hidden rounded-xl bg-soft">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {ev.cover_url && <img src={ev.cover_url} alt="" className="h-full w-full object-cover" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{ev.name}</span>
                        <span className="text-xs text-muted">สร้าง {fmtDate(ev.created_at)} · รหัส {ev.share_token}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">{ev.photo_count.toLocaleString()}</td>
                  <td className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">{ev.face_count.toLocaleString()}</td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <Badges ev={ev} />
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-muted sm:table-cell">
                    <Expiry ev={ev} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => copyLink(ev)} className="rounded-full px-3 py-1.5 text-xs text-muted hover:bg-soft hover:text-ink">
                      {copied === ev.id ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {events && events.length > 0 && (
        <p className="mt-6 text-xs text-muted">
          แสดง {shown.length} จาก {events.length} อีเวนต์
        </p>
      )}
    </div>
  );
}

function EventCard({ ev, copied, onCopy }: { ev: AdminEvent; copied: boolean; onCopy: () => void }) {
  return (
    <div className="fade-in group">
      <Link href={`/admin/events/${ev.id}`} className="block">
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-soft">
          {ev.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ev.cover_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted">ยังไม่มีรูป — คลิกเพื่ออัปโหลด</div>
          )}
          <div className="absolute left-3 top-3">
            <Badges ev={ev} />
          </div>
        </div>
      </Link>
      <div className="mt-3 flex items-start justify-between gap-3 px-1">
        <Link href={`/admin/events/${ev.id}`} className="min-w-0">
          <p className="truncate font-medium">{ev.name}</p>
          <p className="mt-0.5 text-xs text-muted">
            {ev.photo_count.toLocaleString()} รูป · {ev.face_count.toLocaleString()} ใบหน้า · <Expiry ev={ev} />
          </p>
        </Link>
        <button onClick={onCopy} className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs text-muted transition hover:text-ink">
          {copied ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}
        </button>
      </div>
    </div>
  );
}

function Badges({ ev }: { ev: AdminEvent }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {ev.pending_removals > 0 && <Badge tone="warn">คำขอลบ {ev.pending_removals}</Badge>}
      {ev.failed_count > 0 && <Badge tone="danger">ล้มเหลว {ev.failed_count}</Badge>}
      {ev.pending_count > 0 && <Badge>กำลังสแกน {ev.pending_count}</Badge>}
      {ev.access_code && <Badge>🔒 มีรหัส</Badge>}
      {ev.public_album && <Badge>อัลบั้มเปิด</Badge>}
    </span>
  );
}

function Expiry({ ev }: { ev: AdminEvent }) {
  if (!ev.expires_at) return <span>ไม่ลบอัตโนมัติ</span>;
  const d = daysLeft(ev.expires_at);
  return <span className={d <= 7 ? "font-medium text-amber-600" : ""}>ลบใน {Math.max(0, d)} วัน</span>;
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "warn" | "danger" }) {
  const cls = tone === "warn" ? "bg-amber-400 text-ink" : tone === "danger" ? "bg-red-500 text-white" : "bg-white/90 text-ink ring-1 ring-line";
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] shadow-sm backdrop-blur ${cls}`}>{children}</span>;
}

function Stat({ label, value, hint, live, warn }: { label: string; value?: number; hint?: string; live?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${warn ? "border-amber-200 bg-amber-50/50" : "border-line"}`}>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />}
        {label}
      </p>
      {value === undefined ? <div className="shimmer mt-2 h-6 w-12 rounded-md" /> : <p className="mt-1 text-xl font-semibold tabular-nums">{value.toLocaleString()}</p>}
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function EmptyFirstEvent() {
  return (
    <div className="mt-8 rounded-[32px] border border-dashed border-line px-6 py-16 text-center">
      <p className="text-lg font-semibold">เริ่มอีเวนต์แรกของคุณ</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted">สร้างอีเวนต์ → อัปโหลดรูป → แชร์ QR ให้ผู้ร่วมงานค้นหารูปของตัวเองด้วยใบหน้า</p>
      <Link href="/admin/events/new" className="mt-6 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white">
        + สร้างอีเวนต์
      </Link>
    </div>
  );
}
