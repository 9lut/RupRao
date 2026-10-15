"use client";

import { AlbumIcon, FaceScanIcon, HeartIcon, HelpIcon, SearchIcon } from "./icons";

export type Tab = "album" | "search" | "favorites" | "help";

const LEFT: { key: Tab; label: string; Icon: typeof AlbumIcon }[] = [
  { key: "album", label: "อัลบั้ม", Icon: AlbumIcon },
  { key: "search", label: "ค้นหา", Icon: SearchIcon },
];
const RIGHT: { key: Tab; label: string; Icon: typeof AlbumIcon }[] = [
  { key: "favorites", label: "ถูกใจ", Icon: HeartIcon },
  { key: "help", label: "ช่วยเหลือ", Icon: HelpIcon },
];

/** Floating app-style tab bar with a raised face-scan button in the middle. */
export default function BottomNav({
  tab,
  onTab,
  onScan,
  favoriteCount,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  onScan: () => void;
  favoriteCount: number;
}) {
  const item = ({ key, label, Icon }: (typeof LEFT)[number]) => {
    const active = tab === key;
    return (
      <button
        key={key}
        onClick={() => onTab(key)}
        aria-current={active ? "page" : undefined}
        className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition ${
          active ? "font-semibold text-ink" : "text-muted hover:text-ink"
        }`}
      >
        <span className="relative">
          <Icon size={22} />
          {key === "favorites" && favoriteCount > 0 && (
            <span className="absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-ink px-1 text-[9px] font-semibold text-white">
              {favoriteCount > 99 ? "99+" : favoriteCount}
            </span>
          )}
        </span>
        {label}
        <span className={`absolute bottom-0 h-0.5 w-6 rounded-full bg-ink transition ${active ? "opacity-100" : "opacity-0"}`} />
      </button>
    );
  };

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 px-4">
      <div className="relative mx-auto flex max-w-md items-center rounded-[26px] border border-line bg-white/95 px-2 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)] backdrop-blur">
        {LEFT.map(item)}
        <div className="w-[76px] shrink-0" />
        {RIGHT.map(item)}

        <button
          onClick={onScan}
          aria-label="สแกนใบหน้าเพื่อค้นหา"
          className="absolute left-1/2 top-0 grid h-[68px] w-[68px] -translate-x-1/2 -translate-y-[38%] place-items-center rounded-full border-[5px] border-white bg-ink text-white shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)] transition hover:scale-105 active:scale-95"
        >
          <FaceScanIcon size={28} strokeWidth={1.9} />
        </button>
      </div>
    </nav>
  );
}
