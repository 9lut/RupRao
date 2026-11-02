/**
 * Per-event looks for the attendee page (/e/[token]). Only the event page switches theme, so the
 * admin and the rest of the site keep the RupRao brand. A preset gives the full palette; the
 * organizer can override single colors and banner options (ThemeCustom). Keep the keys in sync with
 * EventTheme / ThemeCustom in apps/api/app/schemas/common.py.
 */

export type ThemeKey = "default" | "lavender" | "sakura" | "ocean";

export interface Palette {
  ink: string;
  muted: string;
  line: string;
  soft: string;
  accent: string;
  pageBg: string;
  /** Banner gradient top → bottom. */
  sky: [string, string];
}

export interface ThemeMeta {
  label: string;
  hint: string;
  palette: Palette;
}

export type LinkKind = "facebook" | "instagram" | "line" | "tiktok" | "youtube" | "website";

export interface EventLink {
  kind: LinkKind;
  url: string;
  label?: string;
}

export interface ThemeCustom {
  ink?: string;
  accent?: string;
  soft?: string;
  page_bg?: string;
  title_color?: string;
  banner_from?: string;
  banner_to?: string;
  overlay?: number;
  motif?: boolean;
  banner_height?: "sm" | "md" | "lg";
  /** Legacy coarse framing; superseded by banner_x / banner_y. */
  banner_position?: "top" | "center" | "bottom";
  /** Framing of the uploaded banner image: focal point (0–100 %) and zoom (1–3). */
  banner_x?: number;
  banner_y?: number;
  banner_zoom?: number;
  /** Browser tab title; default = event name. */
  tab_title?: string;
  /** Stamp the event logo on photos attendees download. */
  watermark?: boolean;
  watermark_position?: "tl" | "tr" | "bl" | "br" | "center";
  watermark_size?: number;
  watermark_opacity?: number;
  /** Buttons under the banner. */
  links?: EventLink[];
  announcement_title?: string;
  announcement?: string;
  title_font?: "noto" | "kanit" | "prompt" | "mitr" | "chakra" | "pridi" | "charm" | "itim";
  /** Transparent site header over the banner. Default: on when there is a banner photo. */
  nav_overlay?: boolean;
}

export const THEMES: Record<ThemeKey, ThemeMeta> = {
  default: {
    label: "มาตรฐาน",
    hint: "ขาว-ดำ เรียบ ๆ ตามแบรนด์รูปเรา",
    palette: { ink: "#0a0a0a", muted: "#6b6b6b", line: "#ececec", soft: "#f6f6f5", accent: "#005dfb", pageBg: "#ffffff", sky: ["#1f2937", "#4b5563"] },
  },
  lavender: {
    label: "ลาเวนเดอร์",
    hint: "ท้องฟ้าและทุ่งดอกลาเวนเดอร์ โทนม่วงอ่อน",
    palette: { ink: "#3d2c63", muted: "#76698f", line: "#e7dff3", soft: "#f4effa", accent: "#8f6ed5", pageBg: "#eef0fb", sky: ["#6a93db", "#e3d8f8"] },
  },
  sakura: {
    label: "ซากุระ",
    hint: "ชมพูพาสเทล กลีบซากุระโปรย",
    palette: { ink: "#5a2a3c", muted: "#8d6b77", line: "#f3e1e7", soft: "#fcf3f6", accent: "#e06c96", pageBg: "#fff5f8", sky: ["#f2a7c3", "#fde4ec"] },
  },
  ocean: {
    label: "ทะเล",
    hint: "ฟ้าน้ำทะเล คลื่นเย็นสบาย",
    palette: { ink: "#0f3550", muted: "#5d7385", line: "#dbe8f0", soft: "#f0f6fa", accent: "#1f8fc9", pageBg: "#eef7fc", sky: ["#3d9bd6", "#b9e1f5"] },
  },
};

export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[];

export function asTheme(value: string | null | undefined): ThemeKey {
  return value && value in THEMES ? (value as ThemeKey) : "default";
}

/* ---------------------------------------------------------------- one-color palettes */

/** Quick picks in the editor; any other color works through the picker. */
export const SWATCHES: { label: string; color: string }[] = [
  { label: "ลาเวนเดอร์", color: "#8f6ed5" },
  { label: "ชมพู", color: "#e06c96" },
  { label: "แดง", color: "#d64545" },
  { label: "ส้ม", color: "#e8833a" },
  { label: "ทอง", color: "#c9a227" },
  { label: "เขียว", color: "#3f9a6b" },
  { label: "ฟ้า", color: "#1f8fc9" },
  { label: "น้ำเงิน", color: "#2f4fb5" },
  { label: "ดำ", color: "#2b2b2b" },
];

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

export const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

/** A whole, readable page palette from one color: dark text, the color as accent, pale surfaces. */
export function paletteFrom(base: string): Pick<ThemeCustom, "ink" | "accent" | "soft" | "page_bg" | "banner_from" | "banner_to"> {
  const [h, s] = hexToHsl(base);
  const sat = Math.min(s, 70);
  return {
    ink: hslToHex(h, Math.min(sat, 45), 22),
    accent: base.toLowerCase(),
    soft: hslToHex(h, sat * 0.8, 95.5),
    page_bg: hslToHex(h, sat * 0.7, 97.5),
    banner_from: hslToHex(h, sat * 0.75, 55),
    banner_to: hslToHex(h, sat * 0.7, 86),
  };
}

const mix = (color: string, pct: number, base = "#ffffff") => `color-mix(in srgb, ${color} ${pct}%, ${base})`;

// Settings that add content or behaviour but don't by themselves call for a banner and new colors.
const NOT_LOOK = new Set<keyof ThemeCustom>([
  "links", "announcement", "announcement_title", "tab_title",
  "watermark", "watermark_position", "watermark_size", "watermark_opacity",
]);

/** True when the event page should look different from the plain RupRao site. */
export function isThemed(theme: ThemeKey, custom: ThemeCustom, bannerUrl: string | null | undefined) {
  return theme !== "default" || !!bannerUrl || (Object.keys(custom) as (keyof ThemeCustom)[]).some((k) => !NOT_LOOK.has(k));
}

/** Whether the site header floats transparently over the banner. */
export function navOverlay(theme: ThemeKey, custom: ThemeCustom, bannerUrl: string | null | undefined) {
  return isThemed(theme, custom, bannerUrl) && (custom.nav_overlay ?? !!bannerUrl);
}

/** Background color the page starts from (also used for the mobile browser bar). */
export function pageColor(theme: ThemeKey, custom: ThemeCustom) {
  return custom.page_bg ?? THEMES[theme].palette.pageBg;
}

/** CSS custom properties for a preset + overrides. Tailwind's bg-ink, text-muted… all read these. */
export function themeVars(theme: ThemeKey, custom: ThemeCustom): Record<string, string> {
  const p = THEMES[theme].palette;
  const ink = custom.ink ?? p.ink;
  const bg = pageColor(theme, custom);
  return {
    "--color-ink": ink,
    // A custom ink gets matching grey text and hairlines derived from it.
    "--color-muted": custom.ink ? mix(ink, 62) : p.muted,
    "--color-line": custom.ink ? mix(ink, 12) : p.line,
    "--color-soft": custom.soft ?? p.soft,
    "--color-accent": custom.accent ?? p.accent,
    "--page-bg": `linear-gradient(180deg, ${bg} 0%, ${mix(bg, 35)} 100%)`,
  };
}
