"use client";

import { useState } from "react";
import type { Photo } from "@/lib/api";

export default function PhotoCard({
  photo,
  similarity,
  onClick,
  onCheck,
  overlay,
  selectable = false,
  selected = false,
  delay = 0,
}: {
  photo: Photo;
  similarity?: number;
  onClick: (e: React.MouseEvent) => void;
  /** Shows a hover checkbox that starts multi-select without entering a mode first. */
  onCheck?: (e: React.MouseEvent) => void;
  overlay?: React.ReactNode;
  selectable?: boolean;
  selected?: boolean;
  delay?: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const ratio = photo.width && photo.height ? `${photo.width} / ${photo.height}` : "1 / 1";

  return (
    <div className="fade-in group relative" style={{ animationDelay: `${delay}ms` }}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selectable ? selected : undefined}
        className={`relative block w-full overflow-hidden rounded-2xl bg-soft outline-none ring-accent/40 transition focus-visible:ring-4 ${
          selected ? "ring-[3px] ring-ink ring-offset-2" : ""
        }`}
        style={{ aspectRatio: ratio }}
        aria-label="รูปภาพ"
      >
        {!loaded && <div className="shimmer absolute inset-0" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.thumbnail_url ?? photo.url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={`h-full w-full object-cover transition duration-500 ${
            selectable ? (selected ? "scale-[0.96]" : "") : "group-hover:scale-[1.03]"
          } ${loaded ? "opacity-100" : "opacity-0"}`}
        />
        {!selectable && onCheck && (
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
        )}
        {similarity !== undefined && (
          <span className="absolute bottom-2.5 left-2.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium tabular-nums text-ink shadow-sm backdrop-blur">
            {(similarity * 100).toFixed(1)}%
          </span>
        )}
      </button>

      {(selectable || onCheck) && (
        <span
          role="checkbox"
          aria-checked={selected}
          aria-label="เลือกรูปนี้"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            (selectable ? onClick : onCheck)?.(e);
          }}
          className={`absolute left-2.5 top-2.5 grid h-7 w-7 cursor-pointer place-items-center rounded-full border-2 text-xs transition ${
            selected
              ? "border-ink bg-ink text-white"
              : selectable
                ? "border-white bg-black/20 text-transparent"
                : "border-white bg-black/20 text-transparent opacity-0 hover:bg-black/40 group-hover:opacity-100"
          }`}
        >
          ✓
        </span>
      )}
      {!selectable && overlay}
    </div>
  );
}
