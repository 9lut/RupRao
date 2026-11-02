"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import BottomNav, { type Tab } from "@/components/BottomNav";
import CameraCapture from "@/components/CameraCapture";
import FacePicker from "@/components/FacePicker";
import Gallery, { GallerySkeleton, useSelection, type GalleryItem } from "@/components/Gallery";
import Lightbox from "@/components/Lightbox";
import Modal from "@/components/Modal";
import NotFoundView from "@/components/NotFoundView";
import RemovalDialog from "@/components/RemovalDialog";
import SelectionBar from "@/components/SelectionBar";
import { Announcement, EventLinks } from "@/components/EventExtras";
import ThemeBanner, { useEventTheme } from "@/components/ThemeBanner";
import {
  AlbumIcon, CameraIcon, FaceScanIcon, HeartIcon, HelpIcon, LockIcon, SearchIcon, SmileIcon,
} from "@/components/icons";
import { ScanCorners, ScanningMark } from "@/components/brand";
import { useDocumentBrand, useProvideEventBrand } from "@/lib/eventBrand";
import { asTheme, navOverlay, type ThemeCustom } from "@/lib/themes";
import { ApiError, publicApi, shrinkSelfie, waitForScanTurn, type FaceBox, type Photo, type PublicEvent, type QueueStatus, type SearchResult } from "@/lib/api";

const CONSENT_KEY = "ruprao_consent_v1";
const NO_CUSTOM: ThemeCustom = {};

function store(kind: "local" | "session") {
  return {
    get(key: string): string | null {
      try {
        return (kind === "local" ? localStorage : sessionStorage).getItem(key);
      } catch {
        return null;
      }
    },
    set(key: string, value: string) {
      try {
        (kind === "local" ? localStorage : sessionStorage).setItem(key, value);
      } catch {}
    },
  };
}
const local = store("local");
const sessionStore = store("session");

function useFavorites(token: string) {
  const key = `ruprao_fav_${token}`;
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      setIds(JSON.parse(local.get(key) ?? "[]"));
    } catch {
      setIds([]);
    }
  }, [key]);
  const toggle = useCallback(
    (id: string) =>
      setIds((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
        local.set(key, JSON.stringify(next));
        return next;
      }),
    [key],
  );
  return { ids, has: (id: string) => ids.includes(id), toggle };
}
type Favs = ReturnType<typeof useFavorites>;

/** Shared context the photo views need. */
interface Ctx {
  token: string;
  code: string | null;
  favorites: Favs;
  /** Opens the "ขอให้ลบรูปของฉัน" dialog for these photos; onSent runs after a successful submit. */
  requestRemoval: (photoIds: string[], onSent?: () => void) => void;
}

export default function EventPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  const [tab, setTab] = useState<Tab>("search");
  const [consented, setConsented] = useState(false);
  // What to do once consent is given: open camera / file picker, or search a dropped file.
  const [consentFor, setConsentFor] = useState<"camera" | "file" | File | null>(null);
  const [howTo, setHowTo] = useState(false);
  const [camera, setCamera] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [faceIndex, setFaceIndex] = useState(0);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueStatus | null>(null);
  const searchRun = useRef(0);

  const favorites = useFavorites(token);
  const theme = asTheme(event?.theme);
  const themeCustom = event?.theme_custom ?? NO_CUSTOM;
  const themed = useEventTheme(theme, themeCustom, event?.banner_url);
  const overlayNav = navOverlay(theme, themeCustom, event?.banner_url);
  useProvideEventBrand(event?.logo_url, event?.name, overlayNav);
  useDocumentBrand(event ? themeCustom.tab_title || event.name : undefined, event?.favicon_url ?? event?.logo_url);
  const [removal, setRemoval] = useState<{ ids: string[]; onSent?: () => void } | null>(null);

  useEffect(() => {
    setConsented(local.get(CONSENT_KEY) === "1");
    publicApi
      .getEvent(token)
      .then((ev) => {
        setEvent(ev);
        publicApi.visit(token).catch(() => {});
        const saved = sessionStore.get(`ruprao_code_${token}`);
        if (!ev.requires_code) setUnlocked(true);
        else if (saved) {
          publicApi
            .checkAccess(token, saved)
            .then(() => {
              setCode(saved);
              setUnlocked(true);
            })
            .catch(() => {});
        }
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, [token]);

  const runSearch = async (f: File, index: number) => {
    const run = ++searchRun.current; // a newer search or "ยกเลิก" makes this one stale
    const stale = () => run !== searchRun.current;
    setTab("search");
    setLoading(true);
    setError(null);
    setQueue(null);
    try {
      const ticket = await waitForScanTurn(token, code, setQueue, stale);
      if (stale()) return;
      setQueue(null);
      const r = await publicApi.search(token, code, await shrinkSelfie(f), index, ticket);
      if (stale()) return;
      setResult(r);
      setFaceIndex(r.face_index);
    } catch (e) {
      if (stale()) return;
      setResult(null);
      setError(e instanceof Error ? e.message : "ค้นหาไม่สำเร็จ");
    } finally {
      if (!stale()) {
        setQueue(null);
        setLoading(false);
      }
    }
  };

  const onFile = (f: File) => {
    setFile(f);
    setResult(null);
    runSearch(f, 0);
  };

  const proceed = (how: "camera" | "file" | File) => {
    if (how === "camera") setCamera(true);
    else if (how === "file") fileRef.current?.click();
    else onFile(how);
  };

  const start = (how: "camera" | "file" | File) => (consented ? proceed(how) : setConsentFor(how));

  const reset = () => {
    searchRun.current++;
    setFile(null);
    setResult(null);
    setError(null);
    setQueue(null);
    setLoading(false);
  };

  if (loadError) {
    return <NotFoundView title="ไม่พบอีเวนต์นี้" body={`${loadError} — ลองสแกน QR อีกครั้ง หรือขอลิงก์ใหม่จากผู้จัดงาน`} />;
  }
  if (!event) {
    return (
      <Centered>
        <div className="shimmer mx-auto h-40 w-full max-w-sm rounded-[28px]" />
      </Centered>
    );
  }
  if (!unlocked) {
    return (
      <CodeGate
        event={event}
        onUnlock={async (c) => {
          await publicApi.checkAccess(token, c);
          sessionStore.set(`ruprao_code_${token}`, c);
          setCode(c);
          setUnlocked(true);
        }}
      />
    );
  }

  const ctx: Ctx = { token, code, favorites, requestRemoval: (ids, onSent) => setRemoval({ ids, onSent }) };
  const searching = !!(file || loading || error);

  return (
    <>
      <ThemeBanner
        theme={theme}
        custom={themeCustom}
        bannerUrl={event.banner_url}
        logoUrl={event.logo_url}
        underNav={overlayNav}
        title={event.name}
        subtitle={event.description}
        photoCount={event.photo_count}
      />
      <div className="mx-auto max-w-[1440px] px-4 pb-36 sm:px-6 lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-10 lg:px-8 lg:pb-20 xl:grid-cols-[320px_minmax(0,1fr)] xl:gap-14">
        {/* ---------- desktop sidebar ---------- */}
        <aside className="hidden lg:block">
          <Sidebar
            event={event}
            tab={tab}
            onTab={setTab}
            favoriteCount={favorites.ids.length}
            onCamera={() => start("camera")}
            onFile={() => start("file")}
            onHowTo={() => setHowTo(true)}
            // The idle search screen already shows a big drop zone; avoid a duplicate card.
            showSearchCard={!(tab === "search" && !searching)}
          />
        </aside>

        {/* ---------- main ---------- */}
        <div className="min-w-0">
          {(themeCustom.announcement || themeCustom.announcement_title) && (
            <Announcement title={themeCustom.announcement_title} text={themeCustom.announcement} className="mt-6 lg:mt-8" />
          )}
          {/* Without a banner the link buttons sit here instead. */}
          {!themed && !!themeCustom.links?.length && (
            <div className="mt-4">
              <EventLinks links={themeCustom.links} />
            </div>
          )}
          <div className={`pt-6 text-center lg:hidden ${themed ? "hidden" : ""}`}>
            <p className="text-xs text-muted">อีเวนต์</p>
            <h1 className="mt-1 text-lg font-semibold tracking-tight">{event.name}</h1>
          </div>

          {tab === "search" &&
            (searching ? (
              <ResultsView
                ctx={ctx}
                file={file}
                result={result}
                loading={loading}
                queue={queue}
                error={error}
                faceIndex={faceIndex}
                onFaceIndex={(i) => file && runSearch(file, i)}
                onRetake={() => start("camera")}
                onPick={() => start("file")}
                onReset={reset}
              />
            ) : (
              <>
                <div className="lg:hidden">
                  <Hero event={event} onCamera={() => start("camera")} onFile={() => start("file")} onHowTo={() => setHowTo(true)} />
                </div>
                <div className="hidden lg:block">
                  <DesktopWelcome event={event} onDrop={(f) => start(f)} onFile={() => start("file")} onCamera={() => start("camera")} />
                </div>
              </>
            ))}

          {tab === "album" && <AlbumView ctx={ctx} enabled={event.public_album} />}
          {tab === "favorites" && <FavoritesView ctx={ctx} />}
          {tab === "help" && <HelpView event={event} onHowTo={() => setHowTo(true)} />}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />

      <div className="lg:hidden">
        <BottomNav tab={tab} onTab={setTab} onScan={() => start("camera")} favoriteCount={favorites.ids.length} />
      </div>

      {camera && (
        <CameraCapture
          onClose={() => setCamera(false)}
          onCapture={(f) => {
            setCamera(false);
            onFile(f);
          }}
        />
      )}

      {consentFor && (
        <ConsentModal
          onClose={() => setConsentFor(null)}
          onAccept={() => {
            local.set(CONSENT_KEY, "1");
            setConsented(true);
            const how = consentFor;
            setConsentFor(null);
            proceed(how);
          }}
        />
      )}

      {howTo && <HowToModal onClose={() => setHowTo(false)} />}

      {removal && (
        <RemovalDialog
          count={removal.ids.length}
          onClose={() => setRemoval(null)}
          onSubmit={async (contact, note) => {
            await publicApi.requestRemoval(token, code, { photo_ids: removal.ids, contact, note });
            removal.onSent?.();
          }}
        />
      )}
    </>
  );
}

/* ================================================================ desktop sidebar */

const NAV: { key: Tab; label: string; Icon: typeof SearchIcon }[] = [
  { key: "search", label: "ค้นหาด้วยใบหน้า", Icon: SearchIcon },
  { key: "album", label: "อัลบั้มทั้งหมด", Icon: AlbumIcon },
  { key: "favorites", label: "รูปที่ถูกใจ", Icon: HeartIcon },
  { key: "help", label: "ช่วยเหลือ", Icon: HelpIcon },
];

function Sidebar({
  event,
  tab,
  onTab,
  favoriteCount,
  onCamera,
  onFile,
  onHowTo,
  showSearchCard,
}: {
  event: PublicEvent;
  tab: Tab;
  onTab: (t: Tab) => void;
  favoriteCount: number;
  onCamera: () => void;
  onFile: () => void;
  onHowTo: () => void;
  showSearchCard: boolean;
}) {
  return (
    <div className="sticky top-14 flex max-h-[calc(100vh-3.5rem)] flex-col gap-6 overflow-y-auto py-8 [scrollbar-width:none]">
      <div>
        <p className="text-xs text-muted">อีเวนต์</p>
        <h1 className="mt-1 text-xl font-semibold leading-snug tracking-tight">{event.name}</h1>
        {event.description && <p className="mt-1 text-sm text-muted">{event.description}</p>}
        <p className="mt-2 text-xs text-muted">{event.photo_count.toLocaleString()} รูปในงานนี้</p>
      </div>

      {showSearchCard && (
      <div className="fade-in rounded-[28px] border border-line bg-gradient-to-b from-white to-soft p-5 text-center">
        <ScanningMark size={72} className="mx-auto" />
        <p className="mt-3 text-[15px] font-semibold">ค้นหารูปของคุณ</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onCamera}
            className="flex flex-col items-center gap-1.5 rounded-2xl bg-ink px-2 py-3 text-xs font-medium text-white transition hover:bg-ink/85"
          >
            <CameraIcon size={20} />
            ถ่ายภาพใบหน้า
          </button>
          <button
            onClick={onFile}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-white px-2 py-3 text-xs font-medium transition hover:border-ink/25"
          >
            <SmileIcon size={20} />
            ใช้ภาพใบหน้า
          </button>
        </div>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted">
          <LockIcon size={10} />
          เซลฟี่ไม่ถูกบันทึกในระบบ
        </p>
      </div>
      )}

      <nav className="-mx-2 flex flex-col gap-0.5">
        {NAV.map(({ key, label, Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => onTab(key)}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                active ? "bg-soft font-medium text-ink" : "text-muted hover:bg-soft/60 hover:text-ink"
              }`}
            >
              <Icon size={19} />
              <span className="flex-1">{label}</span>
              {key === "favorites" && favoriteCount > 0 && (
                <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-white">{favoriteCount}</span>
              )}
              {key === "album" && !event.public_album && <LockIcon size={12} className="text-muted" />}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto space-y-1 border-t border-line pt-4 text-xs text-muted">
        <button onClick={onHowTo} className="block hover:text-ink">
          วิธีการค้นหา
        </button>
        <Link href="/privacy" className="block hover:text-ink">
          ความเป็นส่วนตัวและข้อมูลใบหน้า
        </Link>
        {event.expires_at && (
          <p className="pt-2">ข้อมูลจะถูกลบ {new Date(event.expires_at).toLocaleDateString("th-TH", { dateStyle: "medium" })}</p>
        )}
      </div>
    </div>
  );
}

/** Desktop idle state: a big drop target plus the three steps. */
function DesktopWelcome({
  event,
  onDrop,
  onFile,
  onCamera,
}: {
  event: PublicEvent;
  onDrop: (f: File) => void;
  onFile: () => void;
  onCamera: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <section className="pt-8">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f?.type.startsWith("image/")) onDrop(f);
        }}
        className={`fade-in flex min-h-[460px] flex-col items-center justify-center rounded-[36px] border-2 border-dashed px-10 text-center transition ${
          dragging ? "border-accent bg-accent/5" : "border-line bg-gradient-to-b from-white to-soft/70"
        }`}
      >
        <ScanningMark size={136} />
        <h2 className="mt-6 text-3xl font-semibold tracking-tight">ค้นหารูปของคุณด้วยใบหน้า</h2>
        <p className="mt-3 text-[15px] text-muted">
          ลากรูปที่เห็นหน้าชัดมาวางที่นี่ — เราจะหาจากทั้งหมด {event.photo_count.toLocaleString()} รูปในงาน
        </p>
        <div className="mt-8 flex gap-3">
          <button
            onClick={onFile}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition hover:bg-ink/85"
          >
            <SmileIcon size={18} />
            เลือกรูปจากเครื่อง
          </button>
          <button
            onClick={onCamera}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-6 py-3 text-sm font-medium transition hover:border-ink/25"
          >
            <CameraIcon size={18} />
            ใช้เว็บแคม
          </button>
        </div>
      </div>

      <ol className="mt-10 grid grid-cols-3 gap-6">
        {STEPS.map(([title, body], i) => (
          <li key={i} className="flex gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-soft text-xs font-semibold">{i + 1}</span>
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ================================================================ mobile hero */

function Hero({
  event,
  onCamera,
  onFile,
  onHowTo,
}: {
  event: PublicEvent;
  onCamera: () => void;
  onFile: () => void;
  onHowTo: () => void;
}) {
  return (
    <section className="mx-auto mt-6 max-w-md">
      <div className="fade-in rounded-[32px] border border-line bg-gradient-to-b from-white to-soft px-6 pb-7 pt-10 text-center shadow-[0_30px_60px_-40px_rgba(0,0,0,0.25)]">
        <ScanningMark size={132} className="mx-auto" />

        <h2 className="mt-6 text-xl font-semibold tracking-tight">ค้นหารูปของคุณด้วยใบหน้า</h2>
        <p className="mt-2 text-sm text-muted">
          เลือกวิธีค้นหา จากรูปทั้งหมด {event.photo_count.toLocaleString()} รูปในงานนี้
        </p>

        <div className="mt-7 grid grid-cols-2 gap-3">
          <button
            onClick={onCamera}
            className="flex flex-col items-center gap-2 rounded-2xl bg-ink px-3 py-4 text-sm font-medium text-white transition hover:bg-ink/85 active:scale-[0.98]"
          >
            <CameraIcon size={24} />
            ถ่ายภาพใบหน้า
          </button>
          <button
            onClick={onFile}
            className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-white px-3 py-4 text-sm font-medium text-ink transition hover:border-ink/25 active:scale-[0.98]"
          >
            <SmileIcon size={24} />
            ใช้ภาพใบหน้า
          </button>
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-muted">
          <LockIcon size={11} />
          รูปใบหน้าใช้ค้นหาเท่านั้น ไม่ถูกบันทึกในระบบ
        </p>
      </div>

      <div className="mt-5 flex justify-center">
        <button
          onClick={onHowTo}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm text-ink shadow-sm transition hover:bg-soft"
        >
          <HelpIcon size={16} />
          วิธีการค้นหา
        </button>
      </div>
    </section>
  );
}

/* ================================================================ photo browser (shared) */

type Item = GalleryItem & { face?: FaceBox };

function HeartButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={active ? "เลิกถูกใจ" : "ถูกใจ"}
      aria-pressed={active}
      className={`absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full bg-white/90 shadow-sm backdrop-blur transition active:scale-90 ${
        active ? "text-rose-500" : "text-ink/70 hover:text-ink"
      }`}
    >
      <HeartIcon size={16} filled={active} />
    </button>
  );
}

/**
 * Gallery + toolbar + multi-select download + lightbox. Used by search results, album and favourites.
 * Select by ticking a photo's corner (hover on desktop), Shift-click for a range, or "เลือกหลายรูป".
 */
function PhotoBrowser({
  ctx,
  items,
  toolbarLeft,
  onNotMe,
}: {
  ctx: Ctx;
  items: Item[];
  toolbarLeft?: React.ReactNode;
  onNotMe?: (item: Item) => void;
}) {
  const ids = useMemo(() => items.map((i) => i.photo.id), [items]);
  const selection = useSelection(ids);
  // "remove" = the user tapped "ขอลบรูป": same selection UI, but the only action is sending the request.
  const [mode, setMode] = useState<"download" | "remove">("download");
  const stop = () => {
    selection.stop();
    setMode("download");
  };
  const askRemoval = (photoIds: string[]) =>
    ctx.requestRemoval(photoIds, () => {
      stop();
      setToast("ส่งคำขอลบแล้ว ผู้จัดงานจะตรวจสอบให้");
    });
  const [open, setOpen] = useState<number | null>(null);
  const [zipping, setZipping] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const download = async (photoIds: string[]) => {
    setZipping(true);
    try {
      await publicApi.downloadZip(ctx.token, ctx.code, photoIds);
      stop();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ");
    } finally {
      setZipping(false);
    }
  };

  const lightboxActions = (it: Item) => (
    <>
      {heart(it)}
      <button
        onClick={() => askRemoval([it.photo.id])}
        className="whitespace-nowrap rounded-full border border-line px-4 py-2.5 text-xs text-muted transition hover:border-red-200 hover:text-red-600"
      >
        ขอลบรูปนี้
      </button>
    </>
  );

  const heart = (it: Item) => (
    <button
      onClick={() => ctx.favorites.toggle(it.photo.id)}
      aria-label="ถูกใจ"
      className={`grid h-10 w-10 place-items-center rounded-full border border-line transition hover:bg-soft ${
        ctx.favorites.has(it.photo.id) ? "text-rose-500" : "text-muted"
      }`}
    >
      <HeartIcon size={18} filled={ctx.favorites.has(it.photo.id)} />
    </button>
  );

  return (
    <>
      {items.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-4">{toolbarLeft}</div>
          <div className="flex items-center gap-2">
            {selection.active ? (
              <button onClick={stop} className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-white">
                เสร็จ
              </button>
            ) : (
              <>
                <span className="hidden text-xs text-muted xl:inline">ติ๊กที่มุมรูป · Shift เพื่อเลือกเป็นช่วง</span>
                <button
                  onClick={() => {
                    setMode("remove");
                    selection.start();
                  }}
                  className="rounded-full px-3 py-2 text-xs text-muted transition hover:bg-soft hover:text-red-600"
                >
                  ขอลบรูป
                </button>
                <button
                  onClick={() => {
                    setMode("download");
                    selection.start();
                  }}
                  className="rounded-full border border-line px-4 py-2 text-xs font-medium transition hover:bg-soft"
                >
                  เลือกหลายรูป
                </button>
                <button
                  onClick={() => download(ids)}
                  disabled={zipping || ids.length > 100}
                  title={ids.length > 100 ? "ดาวน์โหลดได้ครั้งละไม่เกิน 100 รูป" : undefined}
                  className="hidden rounded-full bg-ink px-4 py-2 text-xs font-medium text-white transition hover:bg-ink/85 disabled:opacity-40 sm:inline-flex"
                >
                  {zipping ? "กำลังเตรียม…" : `ดาวน์โหลดทั้งหมด (${ids.length})`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {selection.active && mode === "remove" && (
        <div className="fade-in mb-5 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50/60 p-4 text-sm">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-red-500 text-[11px] font-bold text-white">!</span>
          <div>
            <p className="font-medium text-ink">เลือกรูปที่มีคุณ ที่ต้องการให้ลบออกจากระบบ</p>
            <p className="mt-0.5 text-xs text-muted">แตะรูปเพื่อเลือก แล้วกด “ส่งคำขอลบ” — ผู้จัดงานจะตรวจสอบและลบรูปพร้อมข้อมูลใบหน้าในรูปนั้น</p>
          </div>
        </div>
      )}

      <Gallery
        items={items}
        onOpen={setOpen}
        selection={selection}
        renderOverlay={(it) => <HeartButton active={ctx.favorites.has(it.photo.id)} onClick={() => ctx.favorites.toggle(it.photo.id)} />}
      />

      {selection.active && (
        <SelectionBar
          count={selection.count}
          total={items.length}
          onSelectAll={selection.selectAll}
          onClear={selection.clear}
          onCancel={stop}
          className="bottom-28 lg:bottom-6"
        >
          {mode === "remove" ? (
            <button
              onClick={() => askRemoval(selection.ids())}
              disabled={!selection.count}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-40"
            >
              ส่งคำขอลบ {selection.count || ""}
            </button>
          ) : (
            <>
              <button
                onClick={() => askRemoval(selection.ids())}
                disabled={!selection.count}
                className="rounded-full px-3 py-2 text-sm text-muted transition hover:text-red-600 disabled:opacity-40"
              >
                ขอลบ
              </button>
              <button
                onClick={() => download(selection.ids())}
                disabled={!selection.count || zipping || selection.count > 100}
                className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink/85 disabled:opacity-40"
              >
                {zipping ? "กำลังเตรียม…" : selection.count > 100 ? "เกิน 100 รูป" : `ดาวน์โหลด ${selection.count || ""}`}
              </button>
            </>
          )}
        </SelectionBar>
      )}

      {open !== null && (
        <Lightbox
          items={items}
          index={open}
          onClose={() => setOpen(null)}
          onIndexChange={setOpen}
          onDownload={async (it) => {
            const { url } = await publicApi.downloadUrl(ctx.token, ctx.code, it.photo.id);
            window.location.href = url;
          }}
          onNotMe={
            onNotMe &&
            ((it) => {
              onNotMe(it);
              if (open >= items.length - 1) setOpen(Math.max(0, items.length - 2));
            })
          }
          extraActions={lightboxActions}
        />
      )}

      {toast && <Toast text={toast} />}
    </>
  );
}

function Toast({ text, action }: { text: string; action?: { label: string; run: () => void } }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-44 z-50 flex justify-center px-4 lg:bottom-24">
      <div className="fade-in pointer-events-auto flex items-center gap-4 rounded-full bg-ink px-5 py-2.5 text-sm text-white shadow-lg">
        {text}
        {action && (
          <button onClick={action.run} className="font-medium underline underline-offset-4">
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

/* ================================================================ search results */

function SelfieAvatar({ file, face, size }: { file: File; face?: FaceBox; size?: { width: number; height: number } }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  let style: React.CSSProperties | undefined;
  if (face && size) {
    const cx = ((face.x + face.width / 2) / size.width) * 100;
    const cy = ((face.y + face.height / 2) / size.height) * 100;
    const scale = Math.min(3, Math.max(1, (0.6 * Math.min(size.width, size.height)) / face.width));
    style = { objectPosition: `${cx}% ${cy}%`, transform: `scale(${scale})`, transformOrigin: `${cx}% ${cy}%` };
  }
  return (
    <span className="block h-12 w-12 shrink-0 overflow-hidden rounded-full ring-1 ring-line lg:h-14 lg:w-14">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" className="h-full w-full object-cover transition duration-500" style={style} />}
    </span>
  );
}

function fmtWait(seconds: number) {
  if (seconds < 60) return `${Math.max(5, Math.ceil(seconds / 5) * 5)} วินาที`;
  return `${Math.ceil(seconds / 60)} นาที`;
}

/** The submitted photo with scan corners and a sweeping line while the API searches or waits in line. */
function ScanningSelfie({ file, queue, onCancel }: { file: File; queue: QueueStatus | null; onCancel: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="fade-in flex flex-col items-center py-6 lg:py-10" role="status" aria-live="polite">
      <div className="relative h-56 w-56 overflow-hidden rounded-[36px] bg-soft shadow-[0_30px_60px_-30px_rgba(0,0,0,0.35)] sm:h-64 sm:w-64">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src && <img src={src} alt="" className="h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/20" />
        <ScanCorners className="absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)]" />
        {!queue && <span className="scan-line on-photo" aria-hidden />}
      </div>
      {queue ? (
        <>
          <p className="mt-6 text-xs text-muted">มีคนสแกนอยู่หลายคน คุณอยู่คิวที่</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">{queue.position.toLocaleString()}</p>
          <p className="mt-2 text-sm text-muted">รอประมาณ {fmtWait(queue.eta_seconds)} · เปิดหน้านี้ค้างไว้ ถึงคิวแล้วจะเริ่มเอง</p>
          <p className="mt-1 text-xs text-muted">รูปของคุณยังอยู่ในเครื่องนี้ ระหว่างรอดูแท็บอื่นได้</p>
        </>
      ) : (
        <>
          <p className="mt-6 text-[15px] font-medium">กำลังสแกนใบหน้า…</p>
          <p className="mt-1 text-xs text-muted">เทียบกับทุกรูปในงานนี้</p>
        </>
      )}
      <button onClick={onCancel} className="mt-4 rounded-full px-4 py-2 text-xs text-muted transition hover:bg-soft hover:text-ink">
        ยกเลิก
      </button>
    </div>
  );
}

function ResultsView({
  ctx,
  file,
  result,
  loading,
  queue,
  error,
  faceIndex,
  onFaceIndex,
  onRetake,
  onPick,
  onReset,
}: {
  ctx: Ctx;
  file: File | null;
  result: SearchResult | null;
  loading: boolean;
  queue: QueueStatus | null;
  error: string | null;
  faceIndex: number;
  onFaceIndex: (i: number) => void;
  onRetake: () => void;
  onPick: () => void;
  onReset: () => void;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<{ id: string } | null>(null);

  useEffect(() => {
    setHidden(new Set());
  }, [result]);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 4000);
    return () => clearTimeout(t);
  }, [undo]);

  const items: Item[] = useMemo(
    () =>
      (result?.results ?? [])
        .filter((r) => !hidden.has(r.photo.id))
        .map((r) => ({ photo: r.photo, similarity: r.similarity, face: r.face })),
    [result, hidden],
  );

  return (
    <section className="mt-6 lg:mt-8">
      {loading && file && <ScanningSelfie file={file} queue={queue} onCancel={onReset} />}

      {/* query summary */}
      {!loading && (
      <div className="flex items-center gap-3 rounded-[22px] border border-line bg-white p-3 pr-4 lg:gap-4 lg:p-4">
        {file && (
          <SelfieAvatar
            file={file}
            face={result?.query_faces[faceIndex]}
            size={result ? { width: result.query_width, height: result.query_height } : undefined}
          />
        )}
        <div className="min-w-0 flex-1">
          {loading ? (
            <>
              <p className="text-sm font-medium">กำลังค้นหาใบหน้า…</p>
              <div className="mt-1.5 h-1 w-32 overflow-hidden rounded-full bg-line">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-ink" />
              </div>
            </>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : result ? (
            <>
              <p className="text-[15px] font-semibold lg:text-lg">พบ {items.length.toLocaleString()} รูปที่มีคุณ</p>
              <p className="text-xs text-muted">ใช้เวลา {(result.took_ms / 1000).toFixed(2)} วินาที</p>
            </>
          ) : null}
        </div>
        <button onClick={onPick} className="hidden rounded-full px-3 py-2 text-xs text-muted transition hover:bg-soft hover:text-ink lg:inline">
          เปลี่ยนรูป
        </button>
        <button onClick={onRetake} className="rounded-full px-3 py-2 text-xs text-muted transition hover:bg-soft hover:text-ink">
          ถ่ายใหม่
        </button>
        <button onClick={onReset} aria-label="ค้นหาใหม่" className="grid h-8 w-8 place-items-center rounded-full text-lg text-muted hover:bg-soft hover:text-ink">
          ×
        </button>
      </div>
      )}

      {file && result && result.query_faces.length > 1 && (
        <div className="text-center lg:text-left">
          <FacePicker
            file={file}
            faces={result.query_faces}
            imageSize={{ width: result.query_width, height: result.query_height }}
            value={faceIndex}
            onChange={onFaceIndex}
            disabled={loading}
          />
        </div>
      )}


      {result && !loading && (
        <div className="mt-6 border-t border-line pt-5">
          {items.length > 0 ? (
            <PhotoBrowser
              ctx={ctx}
              items={items}
              onNotMe={(it) => {
                setHidden((h) => new Set(h).add(it.photo.id));
                setUndo({ id: it.photo.id });
              }}
            />
          ) : (
            <Empty
              title="ไม่พบรูปที่ตรงกัน"
              body={
                result.results.length > 0
                  ? "คุณซ่อนรูปที่พบทั้งหมดแล้ว — กดค้นหาใหม่เพื่อดูอีกครั้ง"
                  : "ลองใช้รูปที่เห็นหน้าชัด มองตรง แสงสว่างพอ ไม่ใส่แว่นกันแดดหรือหน้ากาก"
              }
            />
          )}

          {items.length > 0 && (
            <p className="mt-10 text-center text-xs text-muted">
              ไม่ต้องการให้รูปของคุณอยู่ในระบบ? กด “ขอลบรูป” ด้านบน หรือเปิดรูปแล้วกด “ขอลบรูปนี้”
            </p>
          )}
        </div>
      )}


      {undo && (
        <Toast
          text="ซ่อนรูปนี้แล้ว"
          action={{
            label: "เลิกทำ",
            run: () => {
              setHidden((h) => {
                const n = new Set(h);
                n.delete(undo.id);
                return n;
              });
              setUndo(null);
            },
          }}
        />
      )}
    </section>
  );
}

/* ================================================================ album & favourites */

function AlbumView({ ctx, enabled }: { ctx: Ctx; enabled: boolean }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const { token, code } = ctx;

  useEffect(() => {
    if (!enabled) return;
    publicApi
      .album(token, code)
      .then((p) => {
        setPhotos(p.photos);
        setTotal(p.total);
      })
      .catch(() => setPhotos([]));
  }, [enabled, token, code]);

  const items = useMemo(() => (photos ?? []).map((photo) => ({ photo })), [photos]);

  if (!enabled) {
    return <Empty title="อัลบั้มเป็นแบบส่วนตัว" body="ผู้จัดงานเปิดให้ค้นหาด้วยใบหน้าเท่านั้น เพื่อความเป็นส่วนตัวของผู้ร่วมงานทุกคน" />;
  }
  if (!photos) return <div className="mt-8"><GallerySkeleton /></div>;

  const more = async () => {
    setLoadingMore(true);
    try {
      const p = await publicApi.album(token, code, photos.length);
      setPhotos([...photos, ...p.photos]);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section className="mt-6 lg:mt-8">
      <PhotoBrowser
        ctx={ctx}
        items={items}
        toolbarLeft={<h2 className="text-lg font-semibold">อัลบั้ม <span className="text-sm font-normal text-muted">{total.toLocaleString()} รูป</span></h2>}
      />
      {photos.length < total && (
        <div className="mt-8 text-center">
          <button onClick={more} disabled={loadingMore} className="rounded-full border border-line px-5 py-2.5 text-sm hover:bg-soft disabled:opacity-50">
            {loadingMore ? "กำลังโหลด…" : `โหลดเพิ่ม (${(total - photos.length).toLocaleString()})`}
          </button>
        </div>
      )}
    </section>
  );
}

function FavoritesView({ ctx }: { ctx: Ctx }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const idsKey = ctx.favorites.ids.join(",");
  const { token, code } = ctx;

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    if (!ids.length) return setPhotos([]);
    // Presigned URLs expire, so refresh them from the ids we saved.
    publicApi
      .lookup(token, code, ids)
      .then((list) => {
        const byId = new Map(list.map((p) => [p.id, p]));
        setPhotos(ids.map((id) => byId.get(id)).filter((p): p is Photo => !!p));
      })
      .catch(() => setPhotos([]));
  }, [idsKey, token, code]);

  const items = useMemo(() => (photos ?? []).map((photo) => ({ photo })), [photos]);

  if (!photos) return <div className="mt-8"><GallerySkeleton count={4} /></div>;
  if (!photos.length) {
    return <Empty title="ยังไม่มีรูปที่ถูกใจ" body="แตะ ♥ บนรูปเพื่อเก็บไว้ดูและดาวน์โหลดภายหลัง (บันทึกในเครื่องนี้)" />;
  }

  return (
    <section className="mt-6 lg:mt-8">
      <PhotoBrowser
        ctx={ctx}
        items={items}
        toolbarLeft={<h2 className="text-lg font-semibold">รูปที่ถูกใจ <span className="text-sm font-normal text-muted">{photos.length} รูป</span></h2>}
      />
    </section>
  );
}

/* ================================================================ help, consent, gate */

const STEPS = [
  ["ถ่ายหรือเลือกรูปใบหน้า", "หน้าตรง เห็นชัด แสงสว่างพอ ไม่สวมแว่นกันแดดหรือหน้ากาก"],
  ["รอ AI ค้นหาสักครู่", "ระบบจะเทียบใบหน้าคุณกับทุกรูปในงานนี้ ใช้เวลาไม่กี่วินาที"],
  ["เลือกรูปแล้วดาวน์โหลดทีเดียว", "ติ๊กเลือกหลายรูป หรือกด “ดาวน์โหลดทั้งหมด” ได้เป็นไฟล์ zip"],
] as const;

function HowToModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="วิธีการค้นหา" onClose={onClose}>
      <ol className="space-y-4">
        {STEPS.map(([title, body], i) => (
          <li key={i} className="flex gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-soft text-xs font-semibold">{i + 1}</span>
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-0.5 text-xs text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-5 rounded-2xl bg-soft p-3 text-xs text-muted">
        ถ้ารูปเซลฟี่มีหลายคน ระบบจะให้คุณแตะเลือกใบหน้าของตัวเอง · ถ้าเจอรูปที่ไม่ใช่คุณ กด “ไม่ใช่ฉัน” เพื่อซ่อน
      </p>
      <button onClick={onClose} className="mt-5 w-full rounded-full bg-ink py-2.5 text-sm font-medium text-white">
        เข้าใจแล้ว
      </button>
    </Modal>
  );
}

function ConsentModal({ onAccept, onClose }: { onAccept: () => void; onClose: () => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <Modal title="ก่อนเริ่มค้นหา" onClose={onClose}>
      <ul className="space-y-2.5 text-sm text-muted">
        <li className="flex gap-2.5">
          <span className="text-ink">•</span>
          <span>
            ระบบจะใช้รูปใบหน้าของคุณเพื่อค้นหารูปในงานนี้<span className="font-medium text-ink">เท่านั้น</span>
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="text-ink">•</span>
          <span>
            รูปเซลฟี่ประมวลผลในหน่วยความจำแล้วทิ้งทันที <span className="font-medium text-ink">ไม่ถูกบันทึก</span>
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="text-ink">•</span>
          คุณขอให้ลบรูปของคุณออกจากงานนี้ได้ทุกเมื่อ
        </li>
      </ul>
      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-3 text-sm">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-4 w-4 accent-ink" />
        <span>
          ฉันยินยอมให้ประมวลผลข้อมูลใบหน้าเพื่อการค้นหารูป ตาม
          <Link href="/privacy" target="_blank" className="mx-1 underline underline-offset-4">
            นโยบายความเป็นส่วนตัว
          </Link>
        </span>
      </label>
      <button
        onClick={onAccept}
        disabled={!checked}
        className="mt-5 w-full rounded-full bg-ink py-2.5 text-sm font-medium text-white transition disabled:opacity-30"
      >
        ยินยอมและเริ่มค้นหา
      </button>
    </Modal>
  );
}

function HelpView({ event, onHowTo }: { event: PublicEvent; onHowTo: () => void }) {
  return (
    <section className="mx-auto mt-6 max-w-md space-y-3 lg:mx-0 lg:mt-8 lg:max-w-2xl">
      <h2 className="hidden text-lg font-semibold lg:block">ช่วยเหลือ</h2>
      <button onClick={onHowTo} className="flex w-full items-center justify-between rounded-[22px] border border-line p-4 text-left hover:bg-soft/60">
        <span>
          <span className="block text-sm font-medium">วิธีการค้นหา</span>
          <span className="text-xs text-muted">3 ขั้นตอนง่าย ๆ</span>
        </span>
        <span className="text-muted">→</span>
      </button>
      <Link href="/guide#attendee" className="flex items-center justify-between rounded-[22px] border border-line p-4 hover:bg-soft/60">
        <span>
          <span className="block text-sm font-medium">คู่มือใช้งานแบบละเอียด</span>
          <span className="text-xs text-muted">ทุกขั้นตอนพร้อมภาพหน้าจอ</span>
        </span>
        <span className="text-muted">→</span>
      </Link>
      <Link href="/privacy" className="flex items-center justify-between rounded-[22px] border border-line p-4 hover:bg-soft/60">
        <span>
          <span className="block text-sm font-medium">ความเป็นส่วนตัวและข้อมูลใบหน้า</span>
          <span className="text-xs text-muted">เราเก็บอะไร ใช้อย่างไร ลบเมื่อไร</span>
        </span>
        <span className="text-muted">→</span>
      </Link>
      <div className="rounded-[22px] border border-line p-4">
        <p className="text-sm font-medium">ต้องการให้ลบรูปของคุณ?</p>
        <p className="mt-1 text-xs text-muted">ค้นหาด้วยใบหน้า → กด “ขอลบรูป” → เลือกรูป → “ส่งคำขอลบ” (หรือเปิดรูปแล้วกด “ขอลบรูปนี้”) ผู้จัดงานจะตรวจสอบและลบให้</p>
      </div>
      {event.expires_at && (
        <p className="pt-2 text-center text-xs text-muted lg:text-left">
          รูปและข้อมูลใบหน้าของงานนี้จะถูกลบอัตโนมัติวันที่{" "}
          {new Date(event.expires_at).toLocaleDateString("th-TH", { dateStyle: "long" })}
        </p>
      )}
    </section>
  );
}

function CodeGate({ event, onUnlock }: { event: PublicEvent; onUnlock: (code: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Centered>
      <div className="mx-auto max-w-sm rounded-[32px] border border-line bg-gradient-to-b from-white to-soft px-6 py-10">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ink text-white">
          <LockIcon size={22} />
        </div>
        <h1 className="mt-5 text-lg font-semibold">{event.name}</h1>
        <p className="mt-1 text-sm text-muted">ใส่รหัสเข้าชมจากผู้จัดงาน</p>
        <form
          className="mt-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await onUnlock(value.trim());
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "ตรวจสอบรหัสไม่สำเร็จ");
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoCapitalize="none"
            autoComplete="off"
            placeholder="รหัสเข้าชม"
            className="w-full rounded-full border border-line bg-white px-5 py-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-ink"
          />
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <button disabled={busy || !value.trim()} className="mt-4 w-full rounded-full bg-ink py-3 text-sm font-medium text-white disabled:opacity-40">
            {busy ? "กำลังตรวจสอบ…" : "เข้าสู่อีเวนต์"}
          </button>
        </form>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-md px-4 pb-24 pt-20 text-center">{children}</div>;
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="fade-in mx-auto max-w-sm py-16 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-soft text-muted">
        <FaceScanIcon size={22} />
      </div>
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}
