"use client";

/** Floating bar for multi-select actions. */
export default function SelectionBar({
  count,
  total,
  onSelectAll,
  onClear,
  onCancel,
  children,
  className = "bottom-4",
}: {
  count: number;
  total: number;
  onSelectAll: () => void;
  onClear: () => void;
  onCancel: () => void;
  children: React.ReactNode;
  /** Vertical position, e.g. to sit above a bottom tab bar on phones. */
  className?: string;
}) {
  return (
    <div className={`pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 ${className}`}>
      <div className="fade-in pointer-events-auto flex w-full max-w-xl flex-wrap items-center justify-between gap-2 rounded-[24px] border border-line bg-white/95 py-2 pl-5 pr-2 sm:rounded-full shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)] backdrop-blur">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium tabular-nums">เลือก {count} รูป</span>
          <button
            onClick={count === total ? onClear : onSelectAll}
            className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            {count === total ? "ล้าง" : `เลือกทั้งหมด (${total})`}
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          {children}
          <button onClick={onCancel} className="rounded-full px-3 py-2 text-sm text-muted hover:text-ink">
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}
