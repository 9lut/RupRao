"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FaceBox, Photo } from "@/lib/api";
import PhotoCard from "./PhotoCard";

export interface GalleryItem {
  photo: Photo;
  similarity?: number;
  face?: FaceBox;
}

function useColumnCount(ref: React.RefObject<HTMLElement | null>) {
  const [cols, setCols] = useState(3);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      setCols(w < 560 ? 2 : w < 900 ? 3 : w < 1280 ? 4 : 5);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return cols;
}

/** Selection state for a gallery, with shift-click range selection. */
export function useSelection(ids: string[]) {
  const [selected, setSelected] = useState<Set<string> | undefined>(undefined);
  const anchor = useRef<number | null>(null);

  // Drop ids that disappeared from the list (filtered out, deleted, …).
  const idsKey = ids.join(",");
  useEffect(() => {
    setSelected((s) => {
      if (!s) return s;
      const keep = new Set(ids);
      const next = new Set([...s].filter((id) => keep.has(id)));
      return next.size === s.size ? s : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const toggle = useCallback(
    (index: number, shift = false) => {
      const id = ids[index];
      if (!id) return;
      // Read the anchor now: the updater below runs later, after anchor.current has moved on.
      const from = anchor.current;
      setSelected((prev) => {
        const next = new Set(prev);
        if (shift && from !== null) {
          const [a, b] = [from, index].sort((x, y) => x - y);
          for (let i = a; i <= b; i++) next.add(ids[i]);
        } else if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      anchor.current = index;
    },
    [ids],
  );

  return {
    selected,
    active: selected !== undefined,
    count: selected?.size ?? 0,
    start: () => setSelected((s) => s ?? new Set()),
    stop: () => {
      setSelected(undefined);
      anchor.current = null;
    },
    toggle,
    selectAll: () => setSelected(new Set(ids)),
    clear: () => setSelected(new Set()),
    ids: () => [...(selected ?? [])],
  };
}

export type Selection = ReturnType<typeof useSelection>;

/**
 * Masonry that keeps reading order left→right: each item goes to the currently shortest column,
 * using the known aspect ratio, so there is no layout shift while thumbnails load.
 */
export default function Gallery<T extends GalleryItem>({
  items,
  onOpen,
  renderOverlay,
  selection,
}: {
  items: T[];
  onOpen: (index: number) => void;
  renderOverlay?: (item: T) => React.ReactNode;
  /** Enables checkboxes; while a selection is active, clicks toggle instead of opening. */
  selection?: Selection;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cols = useColumnCount(ref);
  const selecting = selection?.active ?? false;

  const columns = useMemo(() => {
    const out: { item: T; index: number }[][] = Array.from({ length: cols }, () => []);
    const heights = new Array(cols).fill(0);
    items.forEach((item, index) => {
      const { width, height } = item.photo;
      const ratio = width && height ? height / width : 1;
      const target = heights.indexOf(Math.min(...heights));
      out[target].push({ item, index });
      heights[target] += ratio;
    });
    return out;
  }, [items, cols]);

  return (
    <div ref={ref} className="flex gap-3 sm:gap-4">
      {columns.map((col, c) => (
        <div key={c} className="flex min-w-0 flex-1 flex-col gap-3 sm:gap-4">
          {col.map(({ item, index }) => (
            <PhotoCard
              key={item.photo.id}
              photo={item.photo}
              similarity={item.similarity}
              onClick={(e) => (selecting ? selection!.toggle(index, e.shiftKey) : onOpen(index))}
              onCheck={
                selection
                  ? (e) => {
                      selection.start();
                      selection.toggle(index, e.shiftKey);
                    }
                  : undefined
              }
              overlay={renderOverlay?.(item)}
              selectable={selecting}
              selected={selection?.selected?.has(item.photo.id)}
              delay={Math.min(index, 20) * 25}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function GallerySkeleton({ count = 8 }: { count?: number }) {
  const ratios = [1.3, 0.75, 1, 1.4, 0.8, 1.2, 0.7, 1.1];
  return (
    <div className="columns-2 gap-3 sm:columns-3 sm:gap-4 lg:columns-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="shimmer mb-3 w-full rounded-2xl sm:mb-4"
          style={{ aspectRatio: `1 / ${ratios[i % ratios.length]}` }}
        />
      ))}
    </div>
  );
}
