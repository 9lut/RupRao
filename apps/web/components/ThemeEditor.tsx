"use client";

import { useRef, useState } from "react";
import type { AdminEvent } from "@/lib/api";
import { isHex, isThemed, navOverlay, paletteFrom, SWATCHES, THEMES, themeVars, type ThemeCustom, type ThemeKey } from "@/lib/themes";
import AlbumExtrasEditor from "./AlbumExtrasEditor";
import ThemeBanner, { bannerFrame } from "./ThemeBanner";

type ColorKey = "ink" | "accent" | "page_bg" | "soft" | "title_color" | "banner_from" | "banner_to";

const COLORS: { key: ColorKey; label: string; hint: string }[] = [
  { key: "ink", label: "สีหลัก", hint: "ปุ่ม หัวข้อ ตัวอักษร" },
  { key: "accent", label: "สีเน้น", hint: "ไฮไลต์ เส้นสแกนใบหน้า" },
  { key: "page_bg", label: "พื้นหลังหน้า", hint: "ใต้แบนเนอร์" },
  { key: "soft", label: "พื้นรอง", hint: "เมนูที่เลือก กล่องต่าง ๆ" },
  { key: "title_color", label: "ตัวอักษรบนแบนเนอร์", hint: "ชื่องาน คำอธิบาย" },
  { key: "banner_from", label: "แบนเนอร์ ไล่สี (บน)", hint: "ใช้เมื่อไม่มีรูป" },
  { key: "banner_to", label: "แบนเนอร์ ไล่สี (ล่าง)", hint: "ใช้เมื่อไม่มีรูป" },
];

function presetColor(theme: ThemeKey, key: ColorKey): string {
  const p = THEMES[theme].palette;
  switch (key) {
    case "page_bg":
      return p.pageBg;
    case "title_color":
      return "#ffffff";
    case "banner_from":
      return p.sky[0];
    case "banner_to":
      return p.sky[1];
    default:
      return p[key];
  }
}

/**
 * Look of the attendee page with a live preview. Nothing here is sent until the parent form's
 * "บันทึกการตั้งค่า": colors go out with the settings, and a picked banner image is uploaded then.
 */
export default function ThemeEditor({
  event,
  theme,
  custom,
  onCustom,
  onReset,
  bannerSrc,
  bannerPending,
  onPickBanner,
  onRemoveBanner,
  logoSrc,
  logoPending,
  onPickLogo,
  onRemoveLogo,
  faviconSrc,
  faviconPending,
  onPickFavicon,
  onRemoveFavicon,
}: {
  event: AdminEvent;
  theme: ThemeKey;
  custom: ThemeCustom;
  onCustom: (c: ThemeCustom) => void;
  onReset: () => void;
  /** Image shown in the preview: a just-picked local file or the saved banner. */
  bannerSrc: string | null;
  /** The banner differs from what is saved (new pick or removal). */
  bannerPending: boolean;
  onPickBanner: (f: File) => void;
  onRemoveBanner: () => void;
  logoSrc: string | null;
  logoPending: boolean;
  onPickLogo: (f: File) => void;
  onRemoveLogo: () => void;
  faviconSrc: string | null;
  faviconPending: boolean;
  onPickFavicon: (f: File) => void;
  onRemoveFavicon: () => void;
}) {
  const [ownColor, setOwnColor] = useState(custom.accent ?? THEMES[theme].palette.accent);

  const patch = (changes: Partial<ThemeCustom>) => {
    const next: ThemeCustom = { ...custom, ...changes };
    for (const k of Object.keys(changes) as (keyof ThemeCustom)[]) if (changes[k] === undefined) delete next[k];
    onCustom(next);
  };
  const usePalette = (color: string) => {
    setOwnColor(color);
    patch(paletteFrom(color));
  };

  const frame = bannerFrame(custom);
  const overlayNav = navOverlay(theme, custom, bannerSrc);
  const themedLook = isThemed(theme, custom, bannerSrc);
  const customized = themedLook || Object.keys(custom).length > 0 || !!logoSrc || !!faviconSrc;

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">หน้าตาอัลบั้ม</span>
        <a href={`/e/${event.share_token}`} target="_blank" rel="noreferrer" className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline">
          เปิดดูหน้าผู้ร่วมงาน ↗
        </a>
      </div>

      {/* live preview: the same variables the event page sets on <html> */}
      <div>
        <div
          className="overflow-hidden rounded-2xl border border-line"
          style={{ ...themeVars(theme, custom), background: "var(--page-bg)" } as React.CSSProperties}
        >
          {/* mini site header: the event logo replaces RupRao's here */}
          <div className="relative">
          <div
            className={`flex h-10 items-center gap-2 px-3 ${
              overlayNav ? "absolute inset-x-0 top-0 z-10 text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.4)]" : "border-b border-line bg-soft/80"
            }`}
          >
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoSrc} alt="" className="h-6 w-auto max-w-[110px] object-contain" />
            ) : (
              <span className={`text-xs font-semibold ${overlayNav ? "rounded-full bg-white/85 px-2 py-0.5 text-ink [text-shadow:none]" : ""}`}>
                รูปเรา <span className="text-accent">RupRao</span>
              </span>
            )}
            <span className={`ml-auto text-[10px] ${overlayNav ? "text-white/85" : "text-muted"}`}>เกี่ยวกับเรา · ความเป็นส่วนตัว</span>
          </div>
          {themedLook ? (
            <ThemeBanner
              theme={theme}
              custom={custom}
              bannerUrl={bannerSrc}
              logoUrl={logoSrc}
              underNav={overlayNav}
              title={event.name}
              subtitle={event.description}
              photoCount={event.photo_count}
              compact
              onPan={(x, y) => patch({ banner_x: x, banner_y: y })}
            />
          ) : (
            <div className="grid h-[120px] place-items-center text-xs text-muted">ยังไม่ได้ตกแต่ง — เลือกรูปหรือสีด้านล่าง</div>
          )}
          </div>
          <div className="flex items-center gap-2 p-4 text-ink">
            <span className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-white">ถ่ายภาพใบหน้า</span>
            <span className="rounded-full border border-line bg-white px-4 py-2 text-xs font-medium">ใช้ภาพใบหน้า</span>
            <span className="hidden rounded-xl bg-soft px-3 py-2 text-xs sm:inline">เมนู</span>
            <span className="ml-auto h-1 w-12 rounded-full bg-accent" />
          </div>
        </div>
        {bannerSrc && (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs text-muted">ซูม</span>
            <input
              type="range"
              className="range flex-1"
              min={100}
              max={300}
              value={Math.round(frame.zoom * 100)}
              onChange={(e) => patch({ banner_zoom: Number(e.target.value) / 100 })}
            />
            <button
              type="button"
              onClick={() => patch({ banner_x: undefined, banner_y: undefined, banner_zoom: undefined, banner_position: undefined })}
              className="text-[11px] text-muted hover:text-ink"
            >
              จัดกึ่งกลาง
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <ImagePick
          title="รูปปกแบนเนอร์"
          hint="แนวนอน กว้าง 1600px ขึ้นไป · ลากรูปในตัวอย่างเพื่อจัดตำแหน่ง"
          has={!!bannerSrc}
          pending={bannerPending}
          onPick={onPickBanner}
          onRemove={onRemoveBanner}
        />
        <ImagePick
          title="โลโก้อัลบั้ม"
          hint="PNG พื้นใสสวยที่สุด · แทนโลโก้รูปเราเฉพาะหน้าอัลบั้มนี้"
          has={!!logoSrc}
          pending={logoPending}
          onPick={onPickLogo}
          onRemove={onRemoveLogo}
        />
      </div>

      {/* browser tab */}
      <Section title="แท็บเบราว์เซอร์" hint="ชื่อและไอคอนที่เห็นบนแท็บ เมื่อเปิดหน้าอัลบั้มนี้">
        <div className="flex max-w-sm items-center gap-2 rounded-t-xl border border-b-0 border-line bg-soft px-3 py-2">
          {faviconSrc || logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={(faviconSrc ?? logoSrc)!} alt="" className="h-4 w-4 shrink-0 object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/icon.png" alt="" className="h-4 w-4 shrink-0" />
          )}
          <span className="truncate text-xs">{custom.tab_title || event.name}</span>
          <span className="ml-auto text-xs text-muted">×</span>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium">ชื่อแท็บ</span>
            <input
              value={custom.tab_title ?? ""}
              onChange={(e) => patch({ tab_title: e.target.value || undefined })}
              maxLength={80}
              placeholder={event.name}
              className="mt-2 w-full rounded-xl bg-soft px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ink/10"
            />
            <span className="mt-1 block text-[11px] text-muted">เว้นว่าง = ใช้ชื่ออีเวนต์</span>
          </label>
          <ImagePick
            title="ไอคอนแท็บ"
            hint="สี่เหลี่ยมจัตุรัส PNG พื้นใส · ไม่ใส่ = ใช้โลโก้อัลบั้ม"
            has={!!faviconSrc}
            pending={faviconPending}
            onPick={onPickFavicon}
            onRemove={onRemoveFavicon}
          />
        </div>
      </Section>

      {/* one-color palettes */}
      <Section title="สีธีม" hint="เลือกสีเดียว ระบบจัดชุดสีทั้งหน้าให้อ่านง่ายอัตโนมัติ">
        <div className="flex flex-wrap items-center gap-2">
          {SWATCHES.map((s) => {
            const active = custom.accent?.toLowerCase() === s.color;
            return (
              <button
                key={s.color}
                type="button"
                onClick={() => usePalette(s.color)}
                title={s.label}
                aria-label={s.label}
                aria-pressed={active}
                className={`h-8 w-8 rounded-full ring-offset-2 transition hover:scale-110 ${active ? "ring-2 ring-ink" : ""}`}
                style={{ background: s.color }}
              />
            );
          })}
          <label className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-xs" title="สีของคุณเอง">
            <input
              type="color"
              value={isHex(ownColor) ? ownColor : "#8f6ed5"}
              onChange={(e) => usePalette(e.target.value)}
              className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
            />
            สีของคุณเอง
          </label>
        </div>
      </Section>

      {/* every color, one by one */}
      <Section title="ปรับสีทีละส่วน" hint="คลิกช่องสีเพื่อเลือก หรือพิมพ์รหัสสี เช่น #8F6ED5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {COLORS.map(({ key, label, hint }) => (
            <ColorField
              key={key}
              label={label}
              hint={hint}
              value={custom[key] ?? presetColor(theme, key)}
              overridden={custom[key] !== undefined}
              onChange={(v) => patch({ [key]: v })}
              onClear={() => patch({ [key]: undefined })}
            />
          ))}
        </div>
      </Section>

      <Section title="แบนเนอร์">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <Segmented
            label="แถบเมนูด้านบน"
            value={overlayNav ? "clear" : "solid"}
            options={[["clear", "โปร่งใสทับรูป"], ["solid", "ทึบ"]]}
            onChange={(v) => patch({ nav_overlay: v === "clear" ? (bannerSrc ? undefined : true) : false })}
          />
          <Segmented
            label="ความสูง"
            value={custom.banner_height ?? "md"}
            options={[["sm", "เตี้ย"], ["md", "กลาง"], ["lg", "สูง"]]}
            onChange={(v) => patch({ banner_height: v === "md" ? undefined : v })}
          />
          <label className="block min-w-[180px] flex-1">
            <span className="text-xs font-medium">เงาทับรูป {Math.round((custom.overlay ?? (bannerSrc ? 0.2 : 0)) * 100)}%</span>
            <input
              type="range"
              className="range mt-3 w-full"
              min={0}
              max={80}
              value={Math.round((custom.overlay ?? (bannerSrc ? 0.2 : 0)) * 100)}
              onChange={(e) => patch({ overlay: Number(e.target.value) / 100 })}
            />
          </label>
        </div>
      </Section>

      <div className="border-t border-line pt-5">
        <AlbumExtrasEditor eventName={event.name} custom={custom} patch={patch} logoSrc={logoSrc} sampleSrc={bannerSrc} />
      </div>

      {customized && (
        <button type="button" onClick={onReset} className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline">
          ล้างการตกแต่งทั้งหมด กลับเป็นหน้ามาตรฐาน
        </button>
      )}
    </div>
  );
}

function ImagePick({
  title,
  hint,
  has,
  pending,
  onPick,
  onRemove,
}: {
  title: string;
  hint: string;
  has: boolean;
  pending: boolean;
  onPick: (f: File) => void;
  onRemove: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Section title={title}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => ref.current?.click()} className="rounded-full border border-line px-4 py-2 text-xs font-medium transition hover:bg-soft">
          {has ? "เปลี่ยนรูป" : "เลือกรูป"}
        </button>
        {has && (
          <button type="button" onClick={onRemove} className="rounded-full px-3 py-2 text-xs text-muted hover:text-red-600">
            เอาออก
          </button>
        )}
        {pending && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">ยังไม่บันทึก</span>}
      </div>
      <p className="mt-2 text-[11px] text-muted">{hint}</p>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </Section>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium">{title}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function ColorField({
  label,
  hint,
  value,
  overridden,
  onChange,
  onClear,
}: {
  label: string;
  hint: string;
  value: string;
  overridden: boolean;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  // Local text so a half-typed code doesn't fight the input; commit once it is a full #RRGGBB.
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-8 w-8 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent p-0.5"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium">{label}</span>
        <span className="block truncate text-[11px] text-muted">{hint}</span>
      </span>
      <input
        value={text ?? value.toUpperCase()}
        onChange={(e) => {
          const v = e.target.value.trim();
          setText(v);
          const full = v.startsWith("#") ? v : `#${v}`;
          if (isHex(full)) onChange(full.toLowerCase());
        }}
        onBlur={() => setText(null)}
        maxLength={7}
        spellCheck={false}
        aria-label={`รหัสสี ${label}`}
        className={`w-[74px] rounded-lg bg-soft px-2 py-1 font-mono text-[11px] outline-none focus:ring-2 focus:ring-ink/10 ${overridden ? "text-ink" : "text-muted"}`}
      />
      {overridden && (
        <button type="button" onClick={onClear} title="กลับเป็นค่าเดิม" className="text-xs text-muted hover:text-ink">
          ↺
        </button>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium">{label}</p>
      <div className="mt-2 inline-flex rounded-full bg-soft p-1">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`rounded-full px-3 py-1 text-xs transition ${v === value ? "bg-white font-medium text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
