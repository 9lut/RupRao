"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { adminApi, uploadPhotos } from "@/lib/api";
import { IMAGE_ACCEPT, isImageFile } from "@/lib/imageFiles";
import { analyze, cull, ISSUE_LABEL, phashOf, unchecked, type Verdict } from "@/lib/photoCheck";

// Each request stays small: ≤ 10 files and ≤ 80 MB (Cloudflare's free plan rejects bodies > 100 MB).
const BATCH_FILES = 10;
const BATCH_BYTES = 80 * 1024 * 1024;

interface Progress {
  total: number;
  done: number;
  fraction: number;
  errors: string[];
  skipped: number;
}

type Stage =
  | { kind: "idle" }
  | { kind: "checking"; done: number; total: number }
  | { kind: "review"; items: Verdict[] }
  | { kind: "uploading" | "finished"; progress: Progress };

function batches(files: File[]): File[][] {
  const out: File[][] = [];
  let cur: File[] = [];
  let bytes = 0;
  for (const f of files) {
    if (cur.length && (cur.length >= BATCH_FILES || bytes + f.size > BATCH_BYTES)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(f);
    bytes += f.size;
  }
  if (cur.length) out.push(cur);
  return out;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`;

export default function UploadPanel({ eventId, onUploaded }: { eventId: string; onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const skipCheck = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [check, setCheck] = useState(true);
  const busy = stage.kind === "checking" || stage.kind === "uploading";

  const pick = async (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []).filter(isImageFile);
    if (!files.length || busy) return;
    if (!check) return upload(files.map((file) => ({ file, phash: null })), 0);

    skipCheck.current = false;
    setStage({ kind: "checking", done: 0, total: files.length });
    const existing = await adminApi.photoHashes(eventId).catch(() => ({ content_hashes: [], phashes: [] }));
    const analyses = [];
    for (let i = 0; i < files.length; i++) {
      if (skipCheck.current) return upload(files.map((file) => ({ file, phash: null })), 0);
      try {
        analyses.push(await analyze(files[i]));
      } catch {
        // Undecodable here (e.g. an unusual format) — let the server validate it.
        analyses.push(unchecked(files[i]));
      }
      setStage({ kind: "checking", done: i + 1, total: files.length });
    }
    const items = cull(analyses, existing);
    // Nothing to review → go straight to uploading.
    if (items.every((v) => v.keep)) return upload(items.map((v) => ({ file: v.file, phash: phashOf(v) })), 0);
    setStage({ kind: "review", items });
  };

  const upload = async (list: { file: File; phash: string | null }[], skipped: number) => {
    if (!list.length) return setStage({ kind: "finished", progress: { total: 0, done: 0, fraction: 1, errors: [], skipped } });
    const progress: Progress = { total: list.length, done: 0, fraction: 0, errors: [], skipped };
    setStage({ kind: "uploading", progress: { ...progress } });
    const phashOf = new Map(list.map((x) => [x.file, x.phash]));

    // Small batches keep requests short and let the gallery fill in progressively.
    const all = batches(list.map((x) => x.file));
    for (const [i, batch] of all.entries()) {
      let full = false;
      try {
        const res = await uploadPhotos(
          eventId,
          batch,
          (f) => setStage({ kind: "uploading", progress: { ...progress, fraction: (progress.done + f * batch.length) / progress.total } }),
          batch.map((f) => phashOf.get(f) ?? null),
        );
        progress.errors.push(...res.errors.map((e) => `${e.filename ?? "ไฟล์"}: ${e.error}`));
        full = res.storage_full;
      } catch (e) {
        progress.errors.push(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
      }
      progress.done += batch.length;
      progress.fraction = progress.done / progress.total;
      setStage({ kind: "uploading", progress: { ...progress } });
      onUploaded();
      if (full) {
        // The rest would be sent only to be refused.
        for (const f of all.slice(i + 1).flat()) progress.errors.push(`${f.name}: พื้นที่เต็ม ยังไม่ได้อัปโหลด`);
        break;
      }
    }
    setStage({ kind: "finished", progress });
  };

  return (
    <div>
      {stage.kind === "review" ? (
        <Review
          items={stage.items}
          onChange={(items) => setStage({ kind: "review", items })}
          onCancel={() => setStage({ kind: "idle" })}
          onUpload={(items) =>
            upload(
              items.filter((v) => v.keep).map((v) => ({ file: v.file, phash: phashOf(v) })),
              items.filter((v) => !v.keep).length,
            )
          }
        />
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files);
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
            accept={IMAGE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              pick(e.target.files);
              e.target.value = "";
            }}
          />
          {stage.kind === "checking" ? (
            <>
              <p className="text-sm font-medium">
                กำลังตรวจรูปซ้ำและคุณภาพ {stage.done} / {stage.total}
              </p>
              <Bar fraction={stage.done / stage.total} />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  skipCheck.current = true;
                }}
                className="mt-3 text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                ข้ามการตรวจ อัปโหลดทั้งหมดเลย
              </button>
            </>
          ) : stage.kind === "uploading" ? (
            <>
              <p className="text-sm font-medium">
                กำลังอัปโหลด {Math.min(stage.progress.done + BATCH_FILES, stage.progress.total)} / {stage.progress.total}
              </p>
              <Bar fraction={stage.progress.fraction} />
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
              <p className="mt-1 text-xs text-muted">JPEG, PNG, WebP, HEIC · สูงสุด 50 MB ต่อรูป</p>
            </>
          )}
        </div>
      )}

      {stage.kind === "idle" && (
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-xs text-muted">
          <input type="checkbox" checked={check} onChange={(e) => setCheck(e.target.checked)} className="mt-0.5 h-4 w-4 accent-ink" />
          <span>
            <span className="font-medium text-ink">คัดรูปซ้ำและรูปไม่ดีก่อนอัปโหลด</span> — ตรวจในเครื่องคุณ ไม่ส่งรูปที่ซ้ำ เบลอ มืด หรือสว่างจ้า
            (ให้ตรวจดูก่อนทุกครั้ง)
          </span>
        </label>
      )}

      {stage.kind === "finished" && (
        <div className="mt-3 flex items-start justify-between gap-4 text-sm">
          <div>
            <p className="text-ink">
              อัปโหลดเสร็จ {stage.progress.total - stage.progress.errors.length} / {stage.progress.total} รูป
              {stage.progress.total > 0 && " — AI กำลังสแกนใบหน้า"}
              {stage.progress.skipped > 0 && <span className="text-muted"> · คัดออก {stage.progress.skipped} รูป</span>}
            </p>
            {stage.progress.errors.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-red-600">
                {stage.progress.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {stage.progress.errors.length > 5 && <li>และอีก {stage.progress.errors.length - 5} รายการ</li>}
              </ul>
            )}
          </div>
          <button onClick={() => setStage({ kind: "idle" })} className="text-xs text-muted hover:text-ink">
            ปิด
          </button>
        </div>
      )}
    </div>
  );
}

function Bar({ fraction }: { fraction: number }) {
  return (
    <div className="mt-4 h-1 w-64 overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full bg-ink transition-[width] duration-300" style={{ width: `${fraction * 100}%` }} />
    </div>
  );
}

type Tab = "out" | "in" | "all";
type Reason = keyof typeof ISSUE_LABEL | "ok" | "any";

/**
 * The organizer confirms the suggested cull. Culled photos show their reason; single taps toggle a
 * photo, Shift+click toggles a whole range, and the bulk buttons act on everything the current
 * tab + reason filter shows.
 */
function Review({
  items,
  onChange,
  onCancel,
  onUpload,
}: {
  items: Verdict[];
  onChange: (items: Verdict[]) => void;
  onCancel: () => void;
  onUpload: (items: Verdict[]) => void;
}) {
  const [tab, setTab] = useState<Tab>("out");
  const [reason, setReason] = useState<Reason>("any");
  const [limit, setLimit] = useState(300);
  const last = useRef<number | null>(null);

  const keep = items.filter((v) => v.keep);
  const out = items.filter((v) => !v.keep);
  const saved = out.reduce((n, v) => n + v.file.size, 0);
  const inTab = tab === "out" ? out : tab === "in" ? keep : items;
  const reasons = useMemo(() => {
    const c = new Map<Reason, number>();
    for (const v of inTab) {
      if (!v.issues.length) c.set("ok", (c.get("ok") ?? 0) + 1);
      for (const i of v.issues) c.set(i, (c.get(i) ?? 0) + 1);
    }
    return c;
  }, [inTab]);
  const visible = inTab.filter((v) => reason === "any" || (reason === "ok" ? !v.issues.length : v.issues.includes(reason)));
  const suggested = items.every((v) => v.keep === (v.issues.length === 0));

  const setKeep = (targets: Set<Verdict>, value: boolean) =>
    onChange(items.map((v) => (targets.has(v) && v.keep !== value ? { ...v, keep: value } : v)));

  const click = (e: React.MouseEvent, index: number) => {
    const target = visible[index];
    const value = !target.keep;
    if (e.shiftKey && last.current !== null) {
      const [a, b] = [Math.min(last.current, index), Math.max(last.current, index)];
      setKeep(new Set(visible.slice(a, b + 1)), value);
    } else {
      setKeep(new Set([target]), value);
    }
    last.current = index;
  };

  const switchTo = (t: Tab) => {
    setTab(t);
    setReason("any");
    setLimit(300);
    last.current = null;
  };

  return (
    <div className="fade-in rounded-3xl border border-line p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[15px] font-semibold">
            ตรวจแล้ว {items.length.toLocaleString()} รูป · จะอัปโหลด {keep.length.toLocaleString()} รูป
          </p>
          <p className="mt-1 text-xs text-muted">
            คัดออก {out.length.toLocaleString()} รูป ประหยัด {mb(saved)}
            {!suggested && (
              <button
                onClick={() => onChange(items.map((v) => ({ ...v, keep: v.issues.length === 0 })))}
                className="ml-2 underline underline-offset-4 hover:text-ink"
              >
                กลับเป็นค่าที่ระบบแนะนำ
              </button>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="rounded-full px-4 py-2 text-sm text-muted hover:text-ink">
            ยกเลิก
          </button>
          <button
            onClick={() => onUpload(items)}
            className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-white transition hover:bg-ink/85 disabled:opacity-40"
            disabled={!keep.length}
          >
            อัปโหลด {keep.length.toLocaleString()} รูป
          </button>
        </div>
      </div>

      {/* tab */}
      <div className="mt-4 inline-flex rounded-full bg-soft p-1 text-xs">
        {(
          [
            ["out", `คัดออก (${out.length})`],
            ["in", `จะอัปโหลด (${keep.length})`],
            ["all", `ทั้งหมด (${items.length})`],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} onClick={() => switchTo(t)} className={`rounded-full px-3 py-1 ${tab === t ? "bg-white font-medium shadow-sm" : "text-muted"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* reason filter */}
      {inTab.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          {([["any", inTab.length], ...reasons] as [Reason, number][]).map(([r, n]) => (
            <button
              key={r}
              onClick={() => {
                setReason(r);
                last.current = null;
              }}
              className={`rounded-full px-2.5 py-1 transition ${reason === r ? "bg-ink text-white" : "bg-soft text-muted hover:text-ink"}`}
            >
              {r === "any" ? "ทุกเหตุผล" : r === "ok" ? "ปกติ" : ISSUE_LABEL[r]} {n}
            </button>
          ))}
        </div>
      )}

      {/* bulk */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-soft/70 px-3 py-2">
        <p className="text-[11px] text-muted">
          แตะรูปเพื่อสลับ เก็บ / คัดออก · <b className="font-medium text-ink">Shift + คลิก</b> เพื่อเปลี่ยนทั้งช่วง
        </p>
        {visible.length > 0 && (
          <div className="flex gap-1.5">
            <button
              onClick={() => setKeep(new Set(visible), true)}
              disabled={visible.every((v) => v.keep)}
              className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium transition hover:border-ink/25 disabled:opacity-40"
            >
              เก็บทั้งหมด ({visible.length})
            </button>
            <button
              onClick={() => setKeep(new Set(visible), false)}
              disabled={visible.every((v) => !v.keep)}
              className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-40"
            >
              คัดออกทั้งหมด ({visible.length})
            </button>
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">ไม่มีรูปในส่วนนี้</p>
      ) : (
        <ul className="mt-3 grid max-h-[520px] select-none grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-5 lg:grid-cols-6">
          {visible.slice(0, limit).map((v, i) => (
            <li key={`${v.file.name}-${v.file.lastModified}-${v.file.size}`}>
              <button
                type="button"
                onClick={(e) => click(e, i)}
                className={`group relative block aspect-square w-full overflow-hidden rounded-xl bg-soft ring-2 transition ${v.keep ? "ring-transparent" : "ring-red-300"}`}
                title={v.file.name}
              >
                <Thumb file={v.file} dim={!v.keep} />
                <span className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
                  {v.issues.map((issue) => (
                    <span key={issue} className="rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white backdrop-blur">
                      {ISSUE_LABEL[issue]}
                    </span>
                  ))}
                </span>
                <span
                  className={`absolute bottom-1.5 right-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    v.keep ? "bg-white text-ink" : "bg-red-500 text-white"
                  }`}
                >
                  {v.keep ? "เก็บ" : "คัดออก"}
                </span>
                {v.twinOf && (
                  <span className="absolute inset-x-1.5 bottom-7 truncate text-left text-[10px] text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
                    คล้าย {v.twinOf.name}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {visible.length > limit && (
        <div className="mt-3 text-center">
          <button onClick={() => setLimit((l) => l + 300)} className="rounded-full border border-line px-4 py-1.5 text-xs hover:bg-soft">
            แสดงเพิ่ม (เหลือ {(visible.length - limit).toLocaleString()} รูป)
          </button>
        </div>
      )}
    </div>
  );
}

function Thumb({ file, dim }: { file: File; dim: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" decoding="async" className={`h-full w-full object-cover transition ${dim ? "opacity-50 grayscale" : ""}`} />
  ) : null;
}
