"use client";

import { TITLE_FONTS } from "@/lib/fonts";
import type { EventLink, LinkKind, ThemeCustom } from "@/lib/themes";
import { LINK_KINDS, LinkIcon } from "./EventExtras";

const inputCls = "w-full rounded-xl bg-soft px-3 py-2 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-ink/10";

const POSITIONS: { key: NonNullable<ThemeCustom["watermark_position"]>; label: string; cls: string }[] = [
  { key: "tl", label: "บนซ้าย", cls: "left-[6%] top-[8%]" },
  { key: "tr", label: "บนขวา", cls: "right-[6%] top-[8%]" },
  { key: "center", label: "กลาง", cls: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" },
  { key: "bl", label: "ล่างซ้าย", cls: "bottom-[8%] left-[6%]" },
  { key: "br", label: "ล่างขวา", cls: "bottom-[8%] right-[6%]" },
];

/**
 * Title font, social links, welcome message and download watermark for one album. Like the rest of
 * the theme, changes apply when the settings form is saved.
 */
export default function AlbumExtrasEditor({
  eventName,
  custom,
  patch,
  logoSrc,
  sampleSrc,
}: {
  eventName: string;
  custom: ThemeCustom;
  patch: (changes: Partial<ThemeCustom>) => void;
  logoSrc: string | null;
  /** A photo to preview the watermark on (the banner, if any). */
  sampleSrc: string | null;
}) {
  const links = custom.links ?? [];
  const setLinks = (next: EventLink[]) => patch({ links: next.length ? next : undefined });
  const wm = {
    on: !!custom.watermark,
    position: custom.watermark_position ?? "br",
    size: custom.watermark_size ?? 18,
    opacity: custom.watermark_opacity ?? 0.8,
  };

  return (
    <div className="space-y-6">
      {/* title font */}
      <Block title="ฟอนต์ชื่องาน" hint="ใช้กับชื่องานบนแบนเนอร์">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TITLE_FONTS.map((f) => {
            const active = (custom.title_font ?? "noto") === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => patch({ title_font: f.key === "noto" ? undefined : f.key })}
                className={`rounded-2xl border px-3 py-2.5 text-left transition ${active ? "border-ink ring-2 ring-ink/10" : "border-line hover:border-ink/25"}`}
              >
                <span className={`block truncate text-lg font-semibold leading-tight ${f.className}`}>{eventName || "ชื่องาน"}</span>
                <span className="mt-0.5 block truncate text-[11px] text-muted">{f.label}</span>
              </button>
            );
          })}
        </div>
      </Block>

      {/* welcome message */}
      <Block title="ข้อความต้อนรับ / ประกาศ" hint="แสดงเป็นกล่องเด่นเหนือส่วนค้นหารูป เว้นว่าง = ไม่แสดง">
        <input
          value={custom.announcement_title ?? ""}
          onChange={(e) => patch({ announcement_title: e.target.value || undefined })}
          maxLength={120}
          placeholder="หัวข้อ เช่น ขอบคุณที่มาร่วมงาน 🎉"
          className={inputCls}
        />
        <textarea
          value={custom.announcement ?? ""}
          onChange={(e) => patch({ announcement: e.target.value || undefined })}
          maxLength={2000}
          rows={3}
          placeholder="รายละเอียด เช่น รูปชุดที่ 2 จะอัปโหลดภายในวันอาทิตย์นี้"
          className={`${inputCls} mt-2 resize-y`}
        />
      </Block>

      {/* social links */}
      <Block title="ปุ่มลิงก์ใต้แบนเนอร์" hint="Facebook, IG, LINE ของงาน ได้สูงสุด 6 ปุ่ม">
        <div className="space-y-2">
          {links.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-soft">
                <LinkIcon kind={l.kind} />
              </span>
              <select
                value={l.kind}
                onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, kind: e.target.value as LinkKind } : x)))}
                className="rounded-xl bg-soft px-2 py-2 text-sm outline-none"
                aria-label="ประเภทลิงก์"
              >
                {LINK_KINDS.map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {k.label}
                  </option>
                ))}
              </select>
              <input
                value={l.url}
                onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value.trim() } : x)))}
                placeholder={LINK_KINDS.find((k) => k.kind === l.kind)?.placeholder}
                className={`${inputCls} min-w-0 flex-1 ${l.url && !/^https?:\/\/\S+$/.test(l.url) ? "ring-2 ring-red-300" : ""}`}
                aria-label="ลิงก์"
              />
              <input
                value={l.label ?? ""}
                onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value || undefined } : x)))}
                maxLength={40}
                placeholder="ข้อความปุ่ม"
                className={`${inputCls} w-28`}
                aria-label="ข้อความบนปุ่ม"
              />
              <button type="button" onClick={() => setLinks(links.filter((_, j) => j !== i))} className="px-2 text-muted hover:text-red-600" aria-label="ลบลิงก์">
                ×
              </button>
            </div>
          ))}
        </div>
        {links.length < 6 && (
          <button
            type="button"
            onClick={() => setLinks([...links, { kind: links.length ? "website" : "facebook", url: "" }])}
            className="mt-2 rounded-full border border-line px-3 py-1.5 text-xs hover:bg-soft"
          >
            + เพิ่มลิงก์
          </button>
        )}
        {links.some((l) => !/^https?:\/\/\S+$/.test(l.url)) && (
          <p className="mt-2 text-[11px] text-red-600">ลิงก์ต้องขึ้นต้นด้วย https:// และไม่เว้นวรรค</p>
        )}
      </Block>

      {/* watermark */}
      <Block title="ลายน้ำบนรูปที่แขกดาวน์โหลด" hint="ใส่โลโก้อัลบั้มลงบนรูปตอนดาวน์โหลด (รูปต้นฉบับในระบบไม่ถูกแก้)">
        {!logoSrc ? (
          <p className="rounded-xl bg-soft px-3 py-2 text-xs text-muted">อัปโหลด “โลโก้อัลบั้ม” ด้านบนก่อน แล้วจึงเปิดลายน้ำได้</p>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={wm.on} onChange={(e) => patch({ watermark: e.target.checked || undefined })} className="h-4 w-4 accent-ink" />
              ใส่ลายน้ำโลโก้
            </label>
            {wm.on && (
              <div className="mt-3 grid gap-4 sm:grid-cols-[220px_1fr]">
                {/* preview */}
                <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-gradient-to-br from-[#c9d6e8] to-[#e8dcef]">
                  {sampleSrc && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sampleSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoSrc}
                    alt=""
                    className={`absolute h-auto ${POSITIONS.find((p) => p.key === wm.position)?.cls}`}
                    style={{ width: `${wm.size}%`, opacity: wm.opacity }}
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium">ตำแหน่ง</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {POSITIONS.map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => patch({ watermark_position: p.key === "br" ? undefined : p.key })}
                          className={`rounded-full px-3 py-1 text-xs transition ${wm.position === p.key ? "bg-ink text-white" : "bg-soft text-muted hover:text-ink"}`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="block">
                    <span className="text-xs font-medium">ขนาด {Math.round(wm.size)}% ของความกว้างรูป</span>
                    <input type="range" className="range mt-2 w-full" min={5} max={50} value={wm.size} onChange={(e) => patch({ watermark_size: Number(e.target.value) })} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium">ความทึบ {Math.round(wm.opacity * 100)}%</span>
                    <input
                      type="range"
                      className="range mt-2 w-full"
                      min={10}
                      max={100}
                      value={Math.round(wm.opacity * 100)}
                      onChange={(e) => patch({ watermark_opacity: Number(e.target.value) / 100 })}
                    />
                  </label>
                </div>
              </div>
            )}
          </>
        )}
      </Block>
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium">{title}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}
