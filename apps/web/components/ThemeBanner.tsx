"use client";

import { useEffect, useRef } from "react";
import { titleFontClass } from "@/lib/fonts";
import { isThemed, pageColor, THEMES, themeVars, type ThemeCustom, type ThemeKey } from "@/lib/themes";
import { EventLinks } from "./EventExtras";

/** Switches the whole page (header, body, modals) to the event's theme while it is mounted. */
export function useEventTheme(theme: ThemeKey, custom: ThemeCustom, bannerUrl: string | null | undefined) {
  const themed = isThemed(theme, custom, bannerUrl);
  const key = JSON.stringify([theme, custom]);
  useEffect(() => {
    if (!themed) return;
    const root = document.documentElement;
    const vars = themeVars(theme, custom);
    const meta = document.querySelector('meta[name="theme-color"]');
    const prevColor = meta?.getAttribute("content");
    root.dataset.theme = theme;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    meta?.setAttribute("content", pageColor(theme, custom));
    return () => {
      delete root.dataset.theme;
      for (const k of Object.keys(vars)) root.style.removeProperty(k);
      if (meta && prevColor) meta.setAttribute("content", prevColor);
    };
    // `key` covers theme + custom by value; the objects themselves change identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themed, key]);
  return themed;
}

const HEIGHTS = {
  sm: "min-h-[200px] sm:min-h-[240px] lg:min-h-[280px]",
  md: "min-h-[250px] sm:min-h-[320px] lg:min-h-[380px]",
  lg: "min-h-[320px] sm:min-h-[420px] lg:min-h-[500px]",
};

const LEGACY_Y = { top: 0, center: 50, bottom: 100 } as const;

/** Focal point (%) and zoom for the banner image, with defaults. */
export function bannerFrame(custom: ThemeCustom) {
  return {
    x: custom.banner_x ?? 50,
    y: custom.banner_y ?? LEGACY_Y[custom.banner_position ?? "center"],
    zoom: custom.banner_zoom ?? 1,
  };
}

/**
 * Title strip at the top of a themed event page: the uploaded photo (or a gradient) melting into the
 * page background, with the event name on top. Renders nothing when the event is unthemed.
 * With `onPan`, the photo can be dragged to reposition it (Facebook-cover style) in the editor.
 */
export default function ThemeBanner({
  theme,
  custom,
  bannerUrl,
  logoUrl,
  underNav = false,
  title,
  subtitle,
  photoCount,
  compact = false,
  onPan,
}: {
  theme: ThemeKey;
  custom: ThemeCustom;
  bannerUrl: string | null | undefined;
  logoUrl?: string | null;
  /** The transparent site header sits on top: leave room and darken the top edge for its text. */
  underNav?: boolean;
  title: string;
  subtitle?: string | null;
  photoCount: number;
  /** Small version for the admin preview. */
  compact?: boolean;
  onPan?: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  if (!isThemed(theme, custom, bannerUrl)) return null;

  const p = THEMES[theme].palette;
  const from = custom.banner_from ?? p.sky[0];
  const to = custom.banner_to ?? p.sky[1];
  const fade = pageColor(theme, custom);
  const overlay = custom.overlay ?? (bannerUrl ? 0.2 : 0);
  const { x, y, zoom } = bannerFrame(custom);
  const panning = !!(onPan && bannerUrl);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!panning) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x, y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const box = ref.current?.getBoundingClientRect();
    if (!d || !box || !onPan) return;
    // Dragging the photo down reveals its upper part, so the focal point moves the other way.
    const clamp = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 10) / 10;
    onPan(clamp(d.x - ((e.clientX - d.px) / box.width) * 100 / zoom), clamp(d.y - ((e.clientY - d.py) / box.height) * 100 / zoom));
  };

  return (
    <section
      ref={ref}
      className={`relative isolate overflow-hidden ${panning ? "cursor-grab touch-none select-none active:cursor-grabbing" : ""}`}
      style={{ background: `linear-gradient(180deg, ${from} 0%, ${to} 100%)` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      {bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bannerUrl}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover"
          style={{ objectPosition: `${x}% ${y}%`, transform: `scale(${zoom})`, transformOrigin: `${x}% ${y}%` }}
        />
      ) : (
        <div
          className="pointer-events-none absolute inset-0 -z-20"
          style={{ background: "radial-gradient(60% 50% at 20% 20%, rgba(255,255,255,0.35), transparent 70%), radial-gradient(50% 40% at 85% 30%, rgba(255,255,255,0.25), transparent 70%)" }}
          aria-hidden
        />
      )}
      {overlay > 0 && <div className="pointer-events-none absolute inset-0 -z-10 bg-black" style={{ opacity: overlay }} aria-hidden />}
      {underNav && (
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-28" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.35), transparent)" }} aria-hidden />
      )}
      {/* melt into the page background, like a cover photo flowing into the content */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-1/2" style={{ background: `linear-gradient(180deg, transparent, ${fade})` }} aria-hidden />

      <div
        className={`pointer-events-none mx-auto flex max-w-[1440px] flex-col items-center justify-center px-4 text-center ${
          compact ? `min-h-[180px] pb-10 ${underNav ? "pt-12" : "pt-6"}` : `${HEIGHTS[custom.banner_height ?? "md"]} pb-20 sm:pb-24 ${underNav ? "pt-24" : "pt-10"}`
        }`}
        style={{ color: custom.title_color ?? "#ffffff" }}
      >
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className={`fade-in mb-4 w-auto object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.3)] ${compact ? "h-10" : "h-16 sm:h-24"}`}
          />
        )}
        <h1
          className={`fade-in max-w-4xl font-bold leading-[1.1] tracking-tight ${titleFontClass(custom.title_font)} [text-shadow:0_2px_6px_rgba(0,0,0,0.25),0_6px_32px_rgba(0,0,0,0.35)] ${
            compact ? "text-2xl" : "text-4xl sm:text-6xl lg:text-7xl"
          }`}
        >
          {title}
        </h1>
        {subtitle && (
          <p className={`fade-in mt-3 max-w-2xl font-medium [text-shadow:0_1px_12px_rgba(0,0,0,0.4)] ${compact ? "text-xs" : "text-base sm:text-xl"}`}>
            {subtitle}
          </p>
        )}
        <p className="fade-in mt-5 rounded-full bg-black/20 px-4 py-1.5 text-xs font-medium text-white ring-1 ring-white/40 backdrop-blur-md">
          {photoCount.toLocaleString()} รูปในงานนี้
        </p>
        {!!custom.links?.length && (
          <div className="mt-4">
            <EventLinks links={custom.links} onImage preview={compact} />
          </div>
        )}
      </div>
      {panning && (
        <span className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-[11px] text-white backdrop-blur">
          ลากเพื่อจัดตำแหน่งรูป
        </span>
      )}
    </section>
  );
}
