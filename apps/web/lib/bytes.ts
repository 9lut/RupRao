const GB = 1024 ** 3;

export function fmtBytes(n: number) {
  if (n >= 1024 ** 4) return `${(n / 1024 ** 4).toFixed(2)} TB`;
  if (n >= GB) return `${(n / GB).toFixed(n >= 100 * GB ? 0 : 2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(n >= 100 * 1024 ** 2 ? 0 : 1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** For a quota input: GB as text, "" = unlimited. */
export function quotaToGb(bytes: number | null) {
  return bytes === null ? "" : String(Math.round((bytes / GB) * 100) / 100);
}

export function gbToQuota(gb: string): number | null {
  const n = Number(gb);
  return gb.trim() === "" || !Number.isFinite(n) || n < 0 ? null : Math.round(n * GB);
}
