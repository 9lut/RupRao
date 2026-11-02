import { fmtBytes } from "@/lib/bytes";

export function usageTone(used: number, limit: number | null): "ok" | "warn" | "danger" {
  if (limit === null) return "ok";
  const share = limit > 0 ? used / limit : 1;
  return share >= 0.9 ? "danger" : share >= 0.8 ? "warn" : "ok";
}

/** "1.20 GB / 5.00 GB", or just the amount used when there is no limit. */
export function UsageText({ used, limit }: { used: number; limit: number | null }) {
  const tone = usageTone(used, limit);
  return (
    <span className={tone === "danger" ? "font-medium text-red-600" : tone === "warn" ? "font-medium text-amber-600" : ""}>
      {fmtBytes(used)}
      {limit !== null && ` / ${fmtBytes(limit)}`}
    </span>
  );
}

export function StorageBar({ used, limit, className = "" }: { used: number; limit: number | null; className?: string }) {
  if (limit === null) return null;
  const tone = usageTone(used, limit);
  const share = limit > 0 ? Math.min(1, used / limit) : 1;
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(share * 100)}
      aria-label="พื้นที่ที่ใช้"
      className={`h-1.5 overflow-hidden rounded-full bg-line ${className}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${tone === "danger" ? "bg-red-500" : tone === "warn" ? "bg-amber-400" : "bg-ink"}`}
        style={{ width: `${share * 100}%` }}
      />
    </div>
  );
}

/** Blank = unlimited. */
export function QuotaInput({ value, onChange, className = "" }: { value: string; onChange: (gb: string) => void; className?: string }) {
  return (
    <div className="relative">
      <input
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ไม่จำกัด"
        aria-label="จำกัดพื้นที่ (GB)"
        className={`pr-12 ${className}`}
      />
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted">GB</span>
    </div>
  );
}
