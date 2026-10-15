"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GalleryItem } from "./Gallery";

export default function Lightbox<T extends GalleryItem>({
  items,
  index,
  onClose,
  onIndexChange,
  onDownload,
  onNotMe,
  extraActions,
}: {
  items: T[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  onDownload: (item: T) => Promise<void>;
  /** Hide a wrong match from the results. */
  onNotMe?: (item: T) => void;
  extraActions?: (item: T) => React.ReactNode;
}) {
  const item = items[index];
  const [loaded, setLoaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showFace, setShowFace] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const touchX = useRef<number | null>(null);

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next >= 0 && next < items.length) onIndexChange(next);
    },
    [index, items.length, onIndexChange],
  );

  useEffect(() => setLoaded(false), [item?.photo.id]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [go, onClose]);

  // Preload neighbours for instant navigation.
  useEffect(() => {
    [items[index - 1], items[index + 1]].forEach((n) => {
      if (n) new Image().src = n.photo.url;
    });
  }, [index, items]);

  useEffect(() => {
    if (!item) onClose();
  }, [item, onClose]);
  if (!item) return null;

  // Fit the photo into the stage ourselves so the face box can be positioned in the same frame.
  const pw = item.photo.width ?? 1;
  const ph = item.photo.height ?? 1;
  const scale = stage.w && stage.h ? Math.min(stage.w / pw, stage.h / ph, 1.5) : 0;
  const fit = { width: Math.round(pw * scale), height: Math.round(ph * scale) };
  const face = item.face;

  const download = async () => {
    setDownloading(true);
    try {
      await onDownload(item);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-white/95 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4 sm:px-6">
        <div className="flex items-center gap-2 whitespace-nowrap text-sm text-muted tabular-nums">
          {index + 1} / {items.length}
          {item.similarity !== undefined && (
            <span className="rounded-full bg-soft px-2.5 py-1 text-xs font-medium text-ink">
              ตรงกัน {(item.similarity * 100).toFixed(1)}%
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="ปิด"
          className="grid h-9 w-9 place-items-center rounded-full text-xl text-muted transition hover:bg-soft hover:text-ink"
        >
          ×
        </button>
      </div>

      <div className="relative min-h-0 flex-1 px-4 pb-3 sm:px-16" onClick={onClose}>
        <div ref={stageRef} className="flex h-full w-full items-center justify-center">
          {scale > 0 && (
            <div
              className="relative overflow-hidden rounded-xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.25)]"
              style={fit}
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.photo.thumbnail_url ?? item.photo.url}
                alt=""
                className="absolute inset-0 h-full w-full object-cover blur-sm"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={item.photo.id}
                src={item.photo.url}
                alt=""
                onLoad={() => setLoaded(true)}
                className={`relative h-full w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
              />
              {face && showFace && (
                <div
                  className="fade-in pointer-events-none absolute rounded-[28%] border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]"
                  style={{
                    left: `${((face.x - face.width * 0.15) / pw) * 100}%`,
                    top: `${((face.y - face.height * 0.15) / ph) * 100}%`,
                    width: `${((face.width * 1.3) / pw) * 100}%`,
                    height: `${((face.height * 1.3) / ph) * 100}%`,
                  }}
                />
              )}
            </div>
          )}
        </div>

        <NavButton side="left" disabled={index === 0} onClick={() => go(-1)} />
        <NavButton side="right" disabled={index === items.length - 1} onClick={() => go(1)} />
      </div>

      <div className="pb-safe flex shrink-0 items-center justify-center gap-2 px-4 pt-1">
        {face && (
          <button
            onClick={() => setShowFace((s) => !s)}
            className={`whitespace-nowrap rounded-full px-4 py-2.5 text-xs transition ${showFace ? "bg-soft text-ink" : "border border-line text-muted hover:text-ink"}`}
          >
            กรอบใบหน้า
          </button>
        )}
        {extraActions?.(item)}
        {onNotMe && (
          <button
            onClick={() => onNotMe(item)}
            className="whitespace-nowrap rounded-full border border-line px-4 py-2.5 text-xs text-muted transition hover:text-ink"
          >
            ไม่ใช่ฉัน
          </button>
        )}
        <button
          onClick={download}
          disabled={downloading}
          className="whitespace-nowrap rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-black/80 disabled:opacity-50"
        >
          {downloading ? "กำลังเตรียม…" : "ดาวน์โหลด"}
        </button>
      </div>
    </div>
  );
}

function NavButton({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  if (disabled) return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={side === "left" ? "ก่อนหน้า" : "ถัดไป"}
      className={`absolute top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-line bg-white text-lg shadow-sm transition hover:scale-105 sm:grid ${
        side === "left" ? "left-4" : "right-4"
      }`}
    >
      {side === "left" ? "←" : "→"}
    </button>
  );
}
