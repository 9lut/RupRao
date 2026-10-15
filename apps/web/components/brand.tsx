/**
 * รูปเรา (RupRao) brand.
 *
 * The logo artwork (face in a scan frame + blue magnifier) ships as PNGs in /public/brand, cut from
 * the master file `ruprao-logo-original.png`:
 *   ruprao-mark.png      the symbol alone, transparent, square
 *   ruprao-wordmark.png  "รูปเรา RupRao" lettering
 *   ruprao-logo.png      stacked symbol + lettering
 *   icon-*.png, app/icon.png, app/apple-icon.png  symbol on a white tile (favicons / home screen)
 */

export const BRAND = {
  ink: "#0A0A0A",
  paper: "#FFFFFF",
  signal: "#005DFB",
  mist: "#F6F6F5",
} as const;

export const BRAND_ASSETS = {
  mark: "/brand/ruprao-mark.png",
  wordmark: "/brand/ruprao-wordmark.png",
  logo: "/brand/ruprao-logo.png",
} as const;

export const CREDIT = { name: "Lutfee", label: "พัฒนาโดย Lutfee" } as const;

/** Simplified face-scan geometry (64-unit grid) for small UI glyphs such as the scan button. */
export const MARK = {
  corners:
    "M8 22V16a8 8 0 0 1 8-8h6M42 8h6a8 8 0 0 1 8 8v6M56 42v6a8 8 0 0 1-8 8h-6M22 56h-6a8 8 0 0 1-8-8v-6",
  eyes: [
    { cx: 24.5, cy: 27 },
    { cx: 39.5, cy: 27 },
  ],
  smile: "M23 37.5c5 5.6 13 5.6 18 0",
} as const;

/** The symbol alone. */
export function RupRaoMark({
  size = 32,
  className = "",
  title = "รูปเรา RupRao",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={BRAND_ASSETS.mark}
      width={size}
      height={size}
      alt={title}
      className={`select-none ${className}`}
      draggable={false}
    />
  );
}

/** Symbol on a soft tile, for places that want an "app icon" look. */
export function RupRaoAppIcon({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-grid place-items-center rounded-[22%] bg-white ring-1 ring-line ${className}`}
      style={{ width: size, height: size }}
    >
      <RupRaoMark size={Math.round(size * 0.84)} />
    </span>
  );
}

/** "รูปเรา RupRao" set in type, matching the lettering: Rup in ink, Rao in Signal Blue. */
export function RupRaoName({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={`flex items-baseline gap-1.5 leading-none ${className}`}>
      <span className="text-[17px] font-semibold tracking-tight text-ink">
        รูปเรา
      </span>
      {!compact && (
        <span className="text-[14px] font-semibold tracking-tight">
          <span className="text-ink">Rup</span>
          <span style={{ color: BRAND.signal }}>Rao</span>
        </span>
      )}
    </span>
  );
}

/** Horizontal lockup used in the header. */
export function RupRaoLogo({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <RupRaoMark size={34} />
      <RupRaoName compact={compact} />
    </span>
  );
}

/** The symbol with the scan line sweeping up and down — "searching". */
export function ScanningMark({
  size = 120,
  scanning = true,
  className = "",
}: {
  size?: number;
  scanning?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`relative inline-block ${className}`}
      style={{ width: size, height: size }}
    >
      <RupRaoMark size={size} />
      {scanning && <span className="scan-line" aria-hidden />}
    </span>
  );
}

/** Just the four scan corners, e.g. laid over a photo while it is being scanned. */
export function ScanCorners({
  color = BRAND.paper,
  className = "",
}: {
  color?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={MARK.corners}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
