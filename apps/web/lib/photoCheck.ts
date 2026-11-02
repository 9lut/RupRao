/**
 * Pre-upload culling, done in the browser so duplicates and unusable shots never use bandwidth or
 * storage. Each file gets an exact hash (SHA-256), a perceptual hash (256-bit dHash) plus a tiny
 * normalised thumbnail, a sharpness score (variance of the Laplacian) and its brightness; `cull`
 * then decides what to upload.
 */

export type Issue = "duplicate" | "similar" | "existing" | "blurry" | "dark" | "bright" | "small";

export interface Analysis {
  file: File;
  sha256: string;
  dhash: string; // 64 hex chars (16×16 bits)
  /** 32×32 grayscale, zero mean / unit variance: robust to exposure, sensitive to who is where. */
  tiny: Float32Array;
  sharpness: number;
  brightness: number; // mean luma 0–255
  clipped: number; // share of pixels near pure white
  width: number;
  height: number;
  /** The browser couldn't decode it; the server still validates it on upload. */
  unchecked?: boolean;
}

/** Stand-in for a file the browser can't read: never flagged, never grouped. */
export function unchecked(file: File): Analysis {
  return { file, sha256: "", dhash: "", tiny: new Float32Array(0), sharpness: 0, brightness: 0, clipped: 0, width: 0, height: 0, unchecked: true };
}

export interface Verdict extends Analysis {
  issues: Issue[];
  /** Upload it? Starts as the suggestion; the organizer can override per photo. */
  keep: boolean;
  /** For duplicates: the file kept instead of this one. */
  twinOf?: File;
}

export const ISSUE_LABEL: Record<Issue, string> = {
  duplicate: "ไฟล์ซ้ำ",
  similar: "ภาพคล้ายกัน",
  existing: "มีในอีเวนต์แล้ว",
  blurry: "เบลอ",
  dark: "มืดเกินไป",
  bright: "สว่างจ้า",
  small: "ความละเอียดต่ำ",
};

// Thresholds measured on real event photos (512 px working size). "Similar" must pass both tests:
// re-saves / small edits / near-identical burst frames do, while different people posed in front of
// the same backdrop don't — dropping someone's only photo is far worse than keeping an extra.
const SIMILAR_BITS = 12; // 256-bit dHash Hamming distance…
const SIMILAR_TINY = 0.05; // …and mean |difference| of the normalised 32×32 thumbnails
const EXISTING_BITS = 8; // vs photos already uploaded (only their dHash is stored), so stricter
const BLUR_BELOW = 120;
const DARK_BELOW = 35;
const BRIGHT_ABOVE = 235;
const CLIPPED_ABOVE = 0.55;
const SMALL_BELOW = 500; // shorter side, px
const WORK = 512;

function resized(src: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return ctx;
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function gray(ctx: CanvasRenderingContext2D, w: number, h: number): Float32Array {
  const { data } = ctx.getImageData(0, 0, w, h);
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  return out;
}

export async function analyze(file: File): Promise<Analysis> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width, height } = bitmap;
  const scale = Math.min(1, WORK / Math.max(width, height));
  const w = Math.max(9, Math.round(width * scale));
  const h = Math.max(8, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const g = gray(ctx, w, h);

  // Brightness and blown-out highlights.
  let sum = 0;
  let white = 0;
  for (const v of g) {
    sum += v;
    if (v > 250) white++;
  }

  // Sharpness: variance of the 4-neighbour Laplacian.
  let n = 0;
  let mean = 0;
  let m2 = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
      n++;
      const d = lap - mean;
      mean += d / n;
      m2 += d * (lap - mean);
    }
  }

  // dHash: 17×16 grayscale, one bit per "left pixel brighter than right".
  const s = gray(resized(canvas, 17, 16), 17, 16);
  let bits = "";
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) bits += s[y * 17 + x] > s[y * 17 + x + 1] ? "1" : "0";
  const dhash = BigInt(`0b${bits}`).toString(16).padStart(64, "0");

  const t = gray(resized(canvas, 32, 32), 32, 32);
  let tm = 0;
  for (const v of t) tm += v;
  tm /= t.length;
  let tv = 0;
  for (const v of t) tv += (v - tm) ** 2;
  const sd = Math.sqrt(tv / t.length) || 1;
  const tiny = t.map((v) => (v - tm) / sd);

  return {
    file,
    sha256: await sha256(file),
    dhash,
    tiny,
    sharpness: n ? m2 / n : 0,
    brightness: sum / g.length,
    clipped: white / g.length,
    width,
    height,
  };
}

function tinyDiff(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

function hamming(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (x) {
    count += Number(x & BigInt(1));
    x >>= BigInt(1);
  }
  return count;
}

/** Decide what to upload: drop exact/near duplicates (keeping the sharpest of a burst) and bad shots. */
export function cull(items: Analysis[], existing: { content_hashes: string[]; phashes: string[] }): Verdict[] {
  const known = new Set(existing.content_hashes);
  const verdicts: Verdict[] = items.map((a) => {
    const issues: Issue[] = [];
    if (a.unchecked) return { ...a, issues, keep: true };
    if (known.has(a.sha256) || existing.phashes.some((p) => hamming(p, a.dhash) <= EXISTING_BITS)) issues.push("existing");
    // Dark frames have little edge detail anyway; call them dark, not blurry.
    if (a.sharpness < BLUR_BELOW && a.brightness >= DARK_BELOW) issues.push("blurry");
    if (a.brightness < DARK_BELOW) issues.push("dark");
    if (a.brightness > BRIGHT_ABOVE || a.clipped > CLIPPED_ABOVE) issues.push("bright");
    if (Math.min(a.width, a.height) < SMALL_BELOW) issues.push("small");
    return { ...a, issues, keep: true };
  });

  // Within this batch: group near-identical shots, keep the sharpest of each group.
  const order = [...verdicts].sort((a, b) => b.sharpness - a.sharpness);
  const kept: Verdict[] = [];
  for (const v of order) {
    if (v.unchecked) continue;
    const twin = kept.find(
      (k) => k.sha256 === v.sha256 || (hamming(k.dhash, v.dhash) <= SIMILAR_BITS && tinyDiff(k.tiny, v.tiny) <= SIMILAR_TINY),
    );
    if (twin) {
      v.issues.unshift(twin.sha256 === v.sha256 ? "duplicate" : "similar");
      v.twinOf = twin.file;
    } else if (!v.issues.includes("existing")) {
      kept.push(v);
    }
  }

  for (const v of verdicts) v.keep = v.issues.length === 0;
  return verdicts;
}

/** Perceptual hash to store with the upload (none for files the browser couldn't read). */
export function phashOf(v: Analysis): string | null {
  return v.unchecked ? null : v.dhash;
}
