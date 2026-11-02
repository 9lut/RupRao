"use client";

import { useEffect, useRef, useState } from "react";
import { adminApi, type AdminEvent, type Calibration } from "@/lib/api";
import { asTheme, type ThemeCustom, type ThemeKey } from "@/lib/themes";
import { useConfirm } from "./Confirm";
import OwnerSelect from "./OwnerSelect";
import ThemeEditor from "./ThemeEditor";

const inputCls =
  "w-full rounded-2xl bg-soft px-4 py-2.5 text-sm outline-none ring-ink/10 transition focus:bg-white focus:ring-2";

function toDateInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default function EventSettings({ event, onSaved }: { event: AdminEvent; onSaved: (e: AdminEvent) => void }) {
  const confirm = useConfirm();
  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState(event.description ?? "");
  const [code, setCode] = useState(event.access_code ?? "");
  const [threshold, setThreshold] = useState(Math.round(event.effective_threshold * 100));
  const [expires, setExpires] = useState(toDateInput(event.expires_at));
  const [album, setAlbum] = useState(event.public_album);
  const [ownerId, setOwnerId] = useState<string | null>(event.owner_id);
  const [theme, setTheme] = useState<ThemeKey>(asTheme(event.theme));
  const [themeCustom, setThemeCustom] = useState<ThemeCustom>(event.theme_custom ?? {});
  // Banner / logo picked in the editor stay local until "บันทึก", then upload (or get removed).
  const [bannerPick, setBannerPick] = useState<Pick>(null);
  const [logoPick, setLogoPick] = useState<Pick>(null);
  const [faviconPick, setFaviconPick] = useState<Pick>(null);
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const live = urls.current;
    return () => live.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  const pickFile = (file: File): Pick => {
    const url = URL.createObjectURL(file);
    urls.current.add(url);
    return { file, url };
  };
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [calib, setCalib] = useState<Calibration | null>(null);
  const [calibrating, setCalibrating] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();

    // Spell out changes that affect privacy or who can see what, and ask before applying them.
    const newExpiry = expires ? new Date(`${expires}T23:59:59`) : null;
    const oldExpiry = event.expires_at ? new Date(event.expires_at) : null;
    const risky: string[] = [];
    let danger = false;
    if (event.access_code && !code.trim()) risky.push("ยกเลิกรหัสเข้าชม — ใครมีลิงก์ก็เข้าค้นหาได้");
    if (!event.access_code && code.trim()) risky.push(`เพิ่มรหัสเข้าชม ${code.trim()} — ผู้ร่วมงานที่เปิดลิงก์อยู่ต้องใส่รหัสใหม่`);
    if (event.access_code && code.trim() && code.trim() !== event.access_code) risky.push(`เปลี่ยนรหัสเข้าชมเป็น ${code.trim()} — รหัสเดิมจะใช้ไม่ได้`);
    if (!event.public_album && album) risky.push("เปิดอัลบั้ม — ทุกคนที่เข้าได้จะเห็นทุกรูปในงาน");
    if (event.public_album && !album) risky.push("ปิดอัลบั้ม — ผู้ร่วมงานจะเห็นเฉพาะรูปที่มีตัวเอง");
    if (oldExpiry && !newExpiry) risky.push("ยกเลิกการลบอัตโนมัติ — ข้อมูลใบหน้าจะถูกเก็บไม่มีกำหนด");
    if (newExpiry && (!oldExpiry || newExpiry < oldExpiry)) {
      const days = Math.ceil((newExpiry.getTime() - Date.now()) / 86_400_000);
      if (days <= 7) {
        danger = true;
        risky.push(
          days <= 0
            ? "วันลบเป็นวันนี้หรือผ่านไปแล้ว — อีเวนต์จะถูกลบถาวรภายในหนึ่งชั่วโมง"
            : `อีเวนต์จะถูกลบถาวรในอีก ${days} วัน`,
        );
      }
    }
    const thresholdDelta = Math.abs(threshold / 100 - event.effective_threshold);
    if (thresholdDelta >= 0.1) risky.push(`ความแม่นยำขั้นต่ำ ${Math.round(event.effective_threshold * 100)}% → ${threshold}% — ผลค้นหาจะเปลี่ยนไปชัดเจน`);

    if (
      risky.length &&
      !(await confirm({
        title: "ยืนยันการเปลี่ยนแปลง?",
        message: "การตั้งค่าเหล่านี้มีผลกับผู้ร่วมงานทันที",
        details: risky,
        confirmLabel: "บันทึก",
        tone: danger ? "danger" : "default",
      }))
    )
      return;

    setSaving(true);
    setMessage(null);
    try {
      for (const [asset, pick] of [["banner", bannerPick], ["logo", logoPick], ["favicon", faviconPick]] as const) {
        if (pick === "remove") await adminApi.removeAsset(event.id, asset);
        else if (pick) await adminApi.uploadAsset(event.id, asset, pick.file);
      }
      const updated = await adminApi.updateEvent(event.id, {
        name: name.trim(),
        description: description.trim() || null,
        access_code: code.trim() || null,
        match_threshold: threshold / 100,
        // End of the chosen local day.
        expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
        public_album: album,
        theme,
        // Half-filled link rows are dropped rather than failing the whole save.
        theme_custom: { ...themeCustom, links: filledLinks(themeCustom) },
        // Only super admins may change it (the API refuses otherwise), so only send real changes.
        ...(ownerId !== event.owner_id ? { owner_id: ownerId } : {}),
      });
      onSaved(updated);
      setBannerPick(null);
      setLogoPick(null);
      setFaviconPick(null);
      setMessage({ ok: true, text: "บันทึกแล้ว" });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "บันทึกไม่สำเร็จ" });
    } finally {
      setSaving(false);
    }
  };

  const runCalibration = async () => {
    setCalibrating(true);
    try {
      setCalib(await adminApi.calibrate(event.id));
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "วิเคราะห์ไม่สำเร็จ" });
    } finally {
      setCalibrating(false);
    }
  };

  const maxCount = calib ? Math.max(...calib.bins.map((b) => b.count), 1) : 1;

  return (
    <form onSubmit={save} className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-5">
        <Field label="ชื่ออีเวนต์">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} required className={inputCls} />
        </Field>
        <Field label="คำอธิบาย">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
        </Field>
        <Field label="รหัสเข้าชม" hint="ตัวอักษรหรือตัวเลข 4-16 ตัว เว้นว่าง = ใครมีลิงก์ก็ค้นหาได้">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
            maxLength={16}
            placeholder="ไม่มีรหัส"
            className={`${inputCls} font-mono`}
          />
        </Field>
        <label className="flex items-start gap-3 rounded-2xl border border-line p-4 text-sm">
          <input type="checkbox" checked={album} onChange={(e) => setAlbum(e.target.checked)} className="mt-0.5 h-4 w-4 accent-ink" />
          <span>
            <span className="font-medium">เปิดอัลบั้มให้ผู้ร่วมงานดูทั้งหมด</span>
            <span className="mt-0.5 block text-xs text-muted">ปิดไว้ = ผู้ร่วมงานเห็นเฉพาะรูปที่มีใบหน้าตัวเอง (แนะนำเพื่อความเป็นส่วนตัว)</span>
          </span>
        </label>
        <OwnerSelect value={ownerId} onChange={setOwnerId} />
        <Field label="วันที่ลบข้อมูลอัตโนมัติ" hint="เมื่อถึงวันนี้ รูปและข้อมูลใบหน้าทั้งหมดของอีเวนต์จะถูกลบถาวร เว้นว่าง = ไม่ลบอัตโนมัติ">
          <div className="flex gap-2">
            <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={inputCls} />
            {expires && (
              <button type="button" onClick={() => setExpires("")} className="shrink-0 rounded-full px-3 text-xs text-muted hover:text-ink">
                ไม่ลบ
              </button>
            )}
          </div>
        </Field>
      </div>

      <div className="space-y-5">
        <Field
          label={`ความใกล้เคียงขั้นต่ำ ${threshold}%`}
          hint="ต่ำ = เจอรูปมากขึ้นแต่อาจปนคนอื่น · สูง = แม่นขึ้นแต่อาจตกหล่น ผู้ร่วมงานเห็นเฉพาะรูปที่ผ่านค่านี้"
        >
          <input
            type="range"
            className="range w-full"
            min={20}
            max={80}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </Field>

        <div className="rounded-2xl border border-line p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">ปรับค่าอัตโนมัติจากรูปจริง</p>
              <p className="mt-0.5 text-xs text-muted">วิเคราะห์ความคล้ายของใบหน้าในอีเวนต์นี้แล้วหาจุดแบ่ง “คนเดียวกัน / คนละคน”</p>
            </div>
            <button
              type="button"
              onClick={runCalibration}
              disabled={calibrating}
              className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs transition hover:bg-soft disabled:opacity-50"
            >
              {calibrating ? "กำลังวิเคราะห์…" : "วิเคราะห์"}
            </button>
          </div>

          {calib && (
            <div className="fade-in mt-4">
              <div className="relative flex h-24 items-end gap-px">
                {calib.bins.map((b) => (
                  <div
                    key={b.from}
                    title={`${Math.round(b.from * 100)}%: ${b.count}`}
                    className={`flex-1 rounded-t-sm ${b.from >= calib.suggested_threshold ? "bg-ink" : "bg-[#d4d4d4]"}`}
                    style={{ height: `${Math.max(2, (b.count / maxCount) * 100)}%` }}
                  />
                ))}
                <div
                  className="absolute bottom-0 top-0 w-px bg-accent"
                  style={{ left: `${calib.suggested_threshold * 100}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-muted">
                <span>0%</span>
                <span>คนละคน ← → คนเดียวกัน</span>
                <span>100%</span>
              </div>
              {calib.reliable ? (
                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span>
                    แนะนำ <span className="font-semibold">{Math.round(calib.suggested_threshold * 100)}%</span>
                    <span className="text-xs text-muted"> (จาก {calib.samples.toLocaleString()} คู่ใบหน้า)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setThreshold(Math.round(calib.suggested_threshold * 100))}
                    className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white"
                  >
                    ใช้ค่านี้
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted">ข้อมูลยังน้อยเกินไป (ต้องมีใบหน้าหลายสิบใบขึ้นไป) — ใช้ค่าเริ่มต้นไปก่อน</p>
              )}
            </div>
          )}
        </div>

      </div>

      <div className="border-t border-line pt-8 lg:col-span-2">
        <ThemeEditor
          event={event}
          theme={theme}
          custom={themeCustom}
          onCustom={setThemeCustom}
          onReset={() => {
            setTheme("default");
            setThemeCustom({});
            setBannerPick(event.banner_url ? "remove" : null);
            setLogoPick(event.logo_url ? "remove" : null);
            setFaviconPick(event.favicon_url ? "remove" : null);
          }}
          bannerSrc={srcOf(bannerPick, event.banner_url)}
          bannerPending={bannerPick !== null}
          onPickBanner={(f) => {
            setBannerPick(pickFile(f));
            // A new photo starts centered.
            const rest = { ...themeCustom };
            for (const k of ["banner_x", "banner_y", "banner_zoom", "banner_position"] as const) delete rest[k];
            setThemeCustom(rest);
          }}
          onRemoveBanner={() => setBannerPick(event.banner_url ? "remove" : null)}
          logoSrc={srcOf(logoPick, event.logo_url)}
          logoPending={logoPick !== null}
          onPickLogo={(f) => setLogoPick(pickFile(f))}
          onRemoveLogo={() => setLogoPick(event.logo_url ? "remove" : null)}
          faviconSrc={srcOf(faviconPick, event.favicon_url)}
          faviconPending={faviconPick !== null}
          onPickFavicon={(f) => setFaviconPick(pickFile(f))}
          onRemoveFavicon={() => setFaviconPick(event.favicon_url ? "remove" : null)}
        />
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-white/90 px-4 py-3 backdrop-blur lg:col-span-2">
        <div className="flex items-center gap-3">
          <button
            disabled={saving}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink/85 disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
          </button>
          {message && <span className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`}>{message.text}</span>}
        </div>
      </div>
    </form>
  );
}

type Pick = { file: File; url: string } | "remove" | null;

function filledLinks(custom: ThemeCustom) {
  const links = custom.links?.filter((l) => l.url);
  return links?.length ? links : undefined;
}

function srcOf(pick: Pick, saved: string | null): string | null {
  return pick === "remove" ? null : pick ? pick.url : saved;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-2">{children}</div>
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
