/** Line icons drawn on a 24px grid, stroke = currentColor. */

import { MARK } from "./brand";

type P = { size?: number; className?: string; strokeWidth?: number };

const base = (size = 22, strokeWidth = 1.8) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

/** UI glyph of the brand face scan (corners, eyes, smile) in currentColor. */
export function FaceScanIcon({ size = 22, className, strokeWidth = 1.8 }: P) {
  // Brand mark is drawn on a 64 grid; scale the UI stroke width to match a 24px icon.
  const w = (strokeWidth * 64) / 24;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden>
      <path d={MARK.corners} stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
      {MARK.eyes.map((e) => (
        <circle key={e.cx} {...e} r={3.2} fill="currentColor" />
      ))}
      <path d={MARK.smile} stroke="currentColor" strokeWidth={w} strokeLinecap="round" />
    </svg>
  );
}

export function CameraIcon({ size, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function SmileIcon({ size, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 10v.5M15 10v.5M8.5 14.5a4.5 4.5 0 0 0 7 0" />
    </svg>
  );
}

export function AlbumIcon({ size, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m21 16-5-5-9 9" />
    </svg>
  );
}

export function SearchIcon({ size, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function HeartIcon({ size, className, filled }: P & { filled?: boolean }) {
  return (
    <svg {...base(size)} className={className} fill={filled ? "currentColor" : "none"}>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
    </svg>
  );
}

export function HelpIcon({ size, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.2M12 17h.01" />
    </svg>
  );
}

export function LockIcon({ size, className }: P) {
  return (
    <svg {...base(size, 2)} className={className}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** Brand lockup lives in ./brand.tsx; re-exported here for existing imports. */
export { RupRaoLogo as Logo } from "./brand";
