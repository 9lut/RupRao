"use client";

import { useRef, useState } from "react";
import { uploadPhotos } from "@/lib/api";

const BATCH_SIZE = 10;

interface Progress {
  total: number;
  done: number;
  fraction: number;
  errors: string[];
}

export default function UploadPanel({ eventId, onUploaded }: { eventId: string; onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const busy = progress !== null && progress.done < progress.total;

  const upload = async (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (!files.length || busy) return;

    const state: Progress = { total: files.length, done: 0, fraction: 0, errors: [] };
    setProgress({ ...state });

    // Small batches keep requests short and let the gallery fill in progressively.
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      try {
        const res = await uploadPhotos(eventId, batch, (f) =>
          setProgress({ ...state, fraction: (state.done + f * batch.length) / state.total }),
        );
        state.errors.push(...res.errors.map((e) => `${e.filename ?? "ไฟล์"}: ${e.error}`));
      } catch (e) {
        state.errors.push(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
      }
      state.done += batch.length;
      state.fraction = state.done / state.total;
      setProgress({ ...state });
      onUploaded();
    }
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
        onClick={() => !busy && inputRef.current?.click()}
        className={`relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed px-6 py-10 text-center transition ${
          dragging ? "border-accent bg-accent/5" : "border-[#dcdcdc] hover:border-[#bdbdbd] hover:bg-soft/60"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = "";
          }}
        />
        {busy ? (
          <>
            <p className="text-sm font-medium">
              กำลังอัปโหลด {Math.min(progress!.done + BATCH_SIZE, progress!.total)} / {progress!.total}
            </p>
            <div className="mt-4 h-1 w-64 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-ink transition-[width] duration-300"
                style={{ width: `${progress!.fraction * 100}%` }}
              />
            </div>
          </>
        ) : (
          <>
            <div className="grid h-12 w-12 place-items-center rounded-full bg-soft text-muted">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 16V4m0 0-4 4m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
              </svg>
            </div>
            <p className="mt-3 text-[15px] font-medium">ลากรูปมาวาง หรือคลิกเพื่อเลือกหลายรูป</p>
            <p className="mt-1 text-xs text-muted">JPEG, PNG, WebP · สูงสุด 20 MB ต่อรูป</p>
          </>
        )}
      </div>

      {progress && !busy && (
        <div className="mt-3 flex items-start justify-between gap-4 text-sm">
          <div>
            <p className="text-ink">
              อัปโหลดเสร็จ {progress.total - progress.errors.length} / {progress.total} รูป — AI กำลังสแกนใบหน้า
            </p>
            {progress.errors.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-red-600">
                {progress.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {progress.errors.length > 5 && <li>และอีก {progress.errors.length - 5} รายการ</li>}
              </ul>
            )}
          </div>
          <button onClick={() => setProgress(null)} className="text-xs text-muted hover:text-ink">
            ปิด
          </button>
        </div>
      )}
    </div>
  );
}
