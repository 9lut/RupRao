import type { ThemeCustom } from "./themes";

export type EventAsset = "banner" | "logo" | "favicon";

// Same-origin by default: Caddy serves the API under /api.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export type Role = "superadmin" | "organizer";

export interface AdminMe {
  username: string;
  display_name: string | null;
  role: Role;
  /** The super admin from .env (not a stored account). */
  builtin: boolean;
}

export interface AdminUser {
  id: string;
  username: string;
  display_name: string | null;
  role: Role;
  active: boolean;
  created_at: string;
  last_login_at: string | null;
  event_count: number;
  storage_bytes: number;
  storage_quota_bytes: number | null;
}

export type PhotoStatus = "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED";

export interface AdminEvent {
  id: string;
  name: string;
  description: string | null;
  share_token: string;
  access_code: string | null;
  match_threshold: number | null;
  effective_threshold: number;
  expires_at: string | null;
  public_album: boolean;
  theme: string;
  theme_custom: ThemeCustom;
  banner_url: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  owner_id: string | null;
  owner_name: string | null;
  created_at: string;
  photo_count: number;
  face_count: number;
  pending_count: number;
  failed_count: number;
  pending_removals: number;
  cover_url: string | null;
  storage_bytes: number;
  storage_quota_bytes: number | null;
  visitors: number;
  scan_people: number;
  scans: number;
  download_people: number;
  downloads: number;
}

export interface PublicEvent {
  name: string;
  description: string | null;
  requires_code: boolean;
  expires_at: string | null;
  photo_count: number;
  threshold: number;
  public_album: boolean;
  theme: string;
  theme_custom: ThemeCustom;
  banner_url: string | null;
  logo_url: string | null;
  favicon_url: string | null;
}

export interface Photo {
  id: string;
  width: number | null;
  height: number | null;
  created_at: string;
  url: string;
  thumbnail_url: string | null;
}

export interface AdminPhoto extends Photo {
  event_id: string;
  original_filename: string | null;
  status: PhotoStatus;
  face_count: number;
  error: string | null;
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SearchMatch {
  photo: Photo;
  similarity: number;
  face: FaceBox;
}

export interface SearchResult {
  query_faces: FaceBox[];
  face_index: number;
  query_width: number;
  query_height: number;
  threshold: number;
  took_ms: number;
  results: SearchMatch[];
}

export interface UploadResult {
  uploaded: AdminPhoto[];
  errors: { filename: string | null; error: string }[];
  /** Out of space: sending the rest of the upload is pointless. */
  storage_full: boolean;
}

export interface RemovalRequest {
  id: string;
  event_id: string;
  contact: string | null;
  note: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  created_at: string;
  resolved_at: string | null;
  photos: AdminPhoto[];
}

export interface Calibration {
  samples: number;
  bins: { from: number; count: number }[];
  suggested_threshold: number;
  reliable: boolean;
  current_threshold: number;
}

export interface AdminStats {
  events: number;
  photos: number;
  photos_by_status: Partial<Record<PhotoStatus, number>>;
  faces: number;
  pending_removals: number;
  queue: { queued: number; failed: number; running: number } | null;
  storage_bytes: number;
  storage_quota_bytes: number | null;
  /** Super admins only. */
  disk: DiskUsage | null;
  visitors: number;
  scan_people: number;
  scans: number;
  download_people: number;
  downloads: number;
}

export interface DiskUsage {
  total: number;
  used: number;
  free: number;
}

interface UsageRow {
  photos: number;
  bytes: number;
  quota_bytes: number | null;
  visitors: number;
  scan_people: number;
  download_people: number;
}

export interface SystemOverview {
  disk: DiskUsage | null;
  min_free_bytes: number;
  photos_bytes: number;
  events: number;
  photos: number;
  faces: number;
  accounts: number;
  queue: { queued: number; failed: number; running: number } | null;
  visitors: number;
  scan_people: number;
  scans: number;
  download_people: number;
  downloads: number;
  owners: (UsageRow & { id: string | null; name: string; username: string | null; active: boolean; events: number })[];
  top_events: (UsageRow & { id: string; name: string })[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------- admin session (per-browser convenience; storage can be unavailable) ----------

const TOKEN_KEY = "apf_admin_token";

export const session = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {}
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {}
  },
};

async function parseError(res: Response): Promise<ApiError> {
  let message = `เกิดข้อผิดพลาด (${res.status})`;
  try {
    const body = await res.json();
    if (typeof body.detail === "string") message = body.detail;
    else if (Array.isArray(body.detail) && body.detail[0]?.msg) message = String(body.detail[0].msg).replace(/^Value error, /, "");
  } catch {}
  return new ApiError(res.status, message);
}

async function raw(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new ApiError(0, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
  }
  if (!res.ok) throw await parseError(res);
  return res;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await raw(path, init);
  if (res.status === 204) return undefined as T;
  return res.json();
}

const jsonBody = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------- admin ----------

function adminInit(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  const token = session.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

async function admin<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await json<T>(path, adminInit(init));
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      session.clear();
      if (!location.pathname.startsWith("/admin/login")) {
        location.href = `/admin/login?next=${encodeURIComponent(location.pathname)}`;
      }
    }
    throw e;
  }
}

export const adminApi = {
  login: async (username: string, password: string) => {
    const { token } = await json<{ token: string }>("/auth/login", { method: "POST", ...jsonBody({ username, password }) });
    session.set(token);
  },
  me: () => admin<AdminMe>("/auth/me"),
  listUsers: () => admin<AdminUser[]>("/admin/users"),
  createUser: (body: { username: string; password: string; display_name?: string | null; role: Role; storage_quota_bytes?: number | null }) =>
    admin<AdminUser>("/admin/users", { method: "POST", ...jsonBody(body) }),
  updateUser: (id: string, body: { display_name?: string | null; password?: string; role?: Role; active?: boolean; storage_quota_bytes?: number | null }) =>
    admin<AdminUser>(`/admin/users/${id}`, { method: "PATCH", ...jsonBody(body) }),
  deleteUser: (id: string) => admin<void>(`/admin/users/${id}`, { method: "DELETE" }),
  photoHashes: (eventId: string) => admin<{ content_hashes: string[]; phashes: string[] }>(`/admin/events/${eventId}/photo-hashes`),
  stats: () => admin<AdminStats>("/admin/stats"),
  system: () => admin<SystemOverview>("/admin/system"),
  listEvents: () => admin<AdminEvent[]>("/admin/events"),
  getEvent: (id: string) => admin<AdminEvent>(`/admin/events/${id}`),
  createEvent: (body: {
    name: string;
    description?: string;
    access_code?: string | null;
    retention_days?: number | null;
    no_expiry?: boolean;
    public_album?: boolean;
    owner_id?: string | null;
  }) => admin<AdminEvent>("/admin/events", { method: "POST", ...jsonBody(body) }),
  updateEvent: (id: string, body: Partial<Pick<AdminEvent, "name" | "description" | "access_code" | "match_threshold" | "expires_at" | "public_album" | "theme" | "theme_custom" | "owner_id" | "storage_quota_bytes">>) =>
    admin<AdminEvent>(`/admin/events/${id}`, { method: "PATCH", ...jsonBody(body) }),
  /** Event page look: background photo, logo, or browser-tab icon. */
  uploadAsset: (id: string, asset: EventAsset, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return admin<AdminEvent>(`/admin/events/${id}/assets/${asset}`, { method: "POST", body: form });
  },
  removeAsset: (id: string, asset: EventAsset) => admin<AdminEvent>(`/admin/events/${id}/assets/${asset}`, { method: "DELETE" }),
  rotateLink: (id: string) => admin<AdminEvent>(`/admin/events/${id}/rotate-link`, { method: "POST" }),
  deleteEvent: (id: string) => admin<void>(`/admin/events/${id}`, { method: "DELETE" }),
  calibrate: (id: string) => admin<Calibration>(`/admin/events/${id}/calibrate`, { method: "POST" }),
  listPhotos: (eventId: string) => admin<AdminPhoto[]>(`/admin/events/${eventId}/photos`),
  deletePhoto: (id: string) => admin<void>(`/admin/photos/${id}`, { method: "DELETE" }),
  reprocessPhoto: (id: string) => admin<AdminPhoto>(`/admin/photos/${id}/reprocess`, { method: "POST" }),
  reprocessFailed: (eventId: string) => admin<{ queued: number }>(`/admin/events/${eventId}/reprocess-failed`, { method: "POST" }),
  reprocessAll: (eventId: string) => admin<{ queued: number }>(`/admin/events/${eventId}/reprocess-all`, { method: "POST" }),
  downloadUrl: (id: string) => admin<{ url: string }>(`/admin/photos/${id}/download`),
  downloadZip: async (eventId: string, photoIds: string[]) => {
    const res = await raw(`/admin/events/${eventId}/download`, adminInit({ method: "POST", ...jsonBody({ photo_ids: photoIds }) }));
    saveBlob(await res.blob(), "photos.zip");
  },
  listRemovals: (eventId: string) => admin<RemovalRequest[]>(`/admin/events/${eventId}/removal-requests`),
  resolveRemoval: (id: string, action: "approve" | "reject") =>
    admin<RemovalRequest>(`/admin/removal-requests/${id}/${action}`, { method: "POST" }),
};

/** Upload with progress (fetch has no upload progress events). */
/** `phashes`: perceptual hashes from the pre-upload check, one per file (stored for later duplicate checks). */
export function uploadPhotos(
  eventId: string,
  files: File[],
  onProgress: (fraction: number) => void,
  phashes?: (string | null)[],
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    if (phashes) form.append("phashes", JSON.stringify(phashes));
    xhr.open("POST", `${API_URL}/admin/events/${eventId}/photos`);
    const token = session.get();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as UploadResult);
      else {
        const detail = (body as { detail?: unknown })?.detail;
        reject(new ApiError(xhr.status, typeof detail === "string" ? detail : `อัปโหลดไม่สำเร็จ (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้"));
    xhr.send(form);
  });
}

// ---------- public (attendees) ----------

const VISITOR_KEY = "ruprao_visitor";
let visitor: string | null = null;

/** Random and anonymous, only so the organizer's numbers count people rather than requests. */
function visitorId(): string {
  if (visitor) return visitor;
  try {
    visitor = localStorage.getItem(VISITOR_KEY);
  } catch {}
  if (!visitor) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    visitor = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    try {
      localStorage.setItem(VISITOR_KEY, visitor);
    } catch {}
  }
  return visitor;
}

function codeInit(code: string | null, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  if (code) headers.set("X-Event-Code", code);
  headers.set("X-Visitor-Id", visitorId());
  return { ...init, headers };
}

export const publicApi = {
  getEvent: (token: string) => json<PublicEvent>(`/public/events/${token}`),
  visit: (token: string) => json<void>(`/public/events/${token}/visit`, codeInit(null, { method: "POST" })),
  checkAccess: (token: string, code: string) =>
    json<{ ok: boolean }>(`/public/events/${token}/access`, codeInit(code, { method: "POST" })),
  search: (token: string, code: string | null, file: File, faceIndex = 0) => {
    const form = new FormData();
    form.append("file", file);
    form.append("face_index", String(faceIndex));
    return json<SearchResult>(`/public/events/${token}/search`, codeInit(code, { method: "POST", body: form }));
  },
  album: (token: string, code: string | null, offset = 0, limit = 60) =>
    json<{ photos: Photo[]; total: number }>(`/public/events/${token}/photos?offset=${offset}&limit=${limit}`, codeInit(code)),
  lookup: (token: string, code: string | null, photoIds: string[]) =>
    json<Photo[]>(`/public/events/${token}/photos/lookup`, codeInit(code, { method: "POST", ...jsonBody({ photo_ids: photoIds }) })),
  downloadUrl: (token: string, code: string | null, photoId: string) =>
    json<{ url: string }>(`/public/events/${token}/photos/${photoId}/download`, codeInit(code)),
  downloadZip: async (token: string, code: string | null, photoIds: string[]) => {
    const res = await raw(`/public/events/${token}/download`, codeInit(code, { method: "POST", ...jsonBody({ photo_ids: photoIds }) }));
    saveBlob(await res.blob(), "my-photos.zip");
  },
  requestRemoval: (token: string, code: string | null, body: { photo_ids: string[]; contact?: string; note?: string }) =>
    json<{ id: string; photo_count: number }>(`/public/events/${token}/removal-requests`, codeInit(code, { method: "POST", ...jsonBody(body) })),
};

/** Accepts a share link, a bare token, or "…/e/<token>" pasted from anywhere. */
export function parseShareToken(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/e\/([a-z0-9]{6,32})/i) ?? s.match(/^([a-z0-9]{6,32})$/i);
  return m ? m[1].toLowerCase() : null;
}
