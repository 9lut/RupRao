"use client";

import { useEffect, useState } from "react";
import type { FaceBox } from "@/lib/api";

/** Shown when the selfie has several faces: round crops of each face, tap to search as that person. */
export default function FacePicker({
  file,
  faces,
  imageSize,
  value,
  onChange,
  disabled,
}: {
  file: File;
  faces: FaceBox[];
  imageSize: { width: number; height: number };
  value: number;
  onChange: (index: number) => void;
  disabled?: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (faces.length < 2 || !src) return null;
  const SIZE = 52;

  return (
    <div className="fade-in mt-5">
      <p className="text-xs text-muted">พบ {faces.length} ใบหน้าในรูป — แตะเลือกใบหน้าของคุณ</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2.5">
        {faces.slice(0, 12).map((f, i) => {
          // Crop a square around the face (1.4× padding) via background positioning.
          const side = Math.max(f.width, f.height) * 1.4;
          const cx = f.x + f.width / 2;
          const cy = f.y + f.height / 2;
          const k = SIZE / side;
          return (
            <button
              key={i}
              disabled={disabled}
              onClick={() => onChange(i)}
              aria-label={`ใบหน้าที่ ${i + 1}`}
              aria-pressed={value === i}
              className={`rounded-full p-0.5 transition disabled:opacity-50 ${
                value === i ? "ring-2 ring-ink" : "ring-1 ring-line hover:ring-[#bdbdbd]"
              }`}
            >
              <span
                className="block rounded-full bg-soft"
                style={{
                  width: SIZE,
                  height: SIZE,
                  backgroundImage: `url(${src})`,
                  backgroundSize: `${imageSize.width * k}px ${imageSize.height * k}px`,
                  backgroundPosition: `${-(cx - side / 2) * k}px ${-(cy - side / 2) * k}px`,
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
