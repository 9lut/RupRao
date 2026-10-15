"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/Confirm";
import { RupRaoMark } from "@/components/brand";
import { adminApi } from "@/lib/api";

const RETENTION = [
  { days: 30, label: "30 วัน", hint: "งานเล็ก ส่งรูปเร็ว" },
  { days: 90, label: "90 วัน", hint: "แนะนำ" },
  { days: 180, label: "6 เดือน", hint: "งานใหญ่" },
  { days: 365, label: "1 ปี", hint: "" },
  { days: 0, label: "ไม่ลบอัตโนมัติ", hint: "ต้องลบเอง" },
];

const field =
  "w-full rounded-2xl border border-line bg-white px-4 py-3 text-[15px] outline-none transition placeholder:text-[#b0b0b0] focus:border-ink";

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export default function NewEventPage() {
  const router = useRouter();
  const confirm = useConfirm();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [useCode, setUseCode] = useState(false);
  const [code, setCode] = useState("");
  const [album, setAlbum] = useState(false);
  const [retention, setRetention] = useState(90);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = !!(name || description || useCode || album || retention !== 90);
  const deleteOn = useMemo(
    () => (retention ? new Date(Date.now() + retention * 86_400_000).toLocaleDateString("th-TH", { dateStyle: "long" }) : null),
    [retention],
  );
  const codeValid = !useCode || /^[a-zA-Z0-9]{4,16}$/.test(code);
  const canSubmit = name.trim().length > 0 && codeValid && !saving;

  // Warn before leaving with unsaved input.
  useEffect(() => {
    if (!dirty || saving) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, saving]);

  const cancel = async () => {
    if (
      dirty &&
      !(await confirm({ title: "ทิ้งข้อมูลที่กรอกไว้?", message: "อีเวนต์ยังไม่ถูกสร้าง ข้อมูลในฟอร์มนี้จะหายไป", confirmLabel: "ทิ้งและออก", tone: "danger" }))
    )
      return;
    router.push("/admin");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const details = [
      `ชื่อ: ${name.trim()}`,
      useCode ? `ผู้ร่วมงานต้องใส่รหัสเข้าชม ${code}` : "ใครมีลิงก์/QR ก็ค้นหาได้ (ไม่มีรหัส)",
      album ? "เปิดให้ดูอัลบั้มทั้งหมดได้" : "ผู้ร่วมงานเห็นเฉพาะรูปที่มีใบหน้าตัวเอง",
      deleteOn ? `ลบรูปและข้อมูลใบหน้าอัตโนมัติ ${deleteOn}` : "ไม่ลบอัตโนมัติ — ข้อมูลใบหน้าจะถูกเก็บจนกว่าคุณจะลบเอง",
    ];
    const ok = await confirm({
      title: "สร้างอีเวนต์นี้?",
      message: retention === 0 ? "ข้อมูลใบหน้าเป็นข้อมูลอ่อนไหวตาม PDPA — ควรกำหนดวันลบ เว้นแต่มีเหตุผลที่ต้องเก็บไว้" : "ตรวจสอบการตั้งค่าก่อนสร้าง แก้ไขภายหลังได้ในแท็บตั้งค่า",
      details,
      confirmLabel: "สร้างอีเวนต์",
    });
    if (!ok) return;

    setSaving(true);
    setError(null);
    try {
      const ev = await adminApi.createEvent({
        name: name.trim(),
        description: description.trim(),
        access_code: useCode ? code : null,
        retention_days: retention || null,
        no_expiry: retention === 0,
        public_album: album,
      });
      router.push(`/admin/events/${ev.id}?created=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างอีเวนต์ไม่สำเร็จ");
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-6xl px-4 pb-28 pt-8 sm:px-6">
      <button type="button" onClick={cancel} className="text-sm text-muted hover:text-ink">
        ← อีเวนต์ทั้งหมด
      </button>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">สร้างอีเวนต์ใหม่</h1>
      <p className="mt-1 text-sm text-muted">ตั้งค่า 3 ส่วน ใช้เวลาไม่ถึงนาที — แก้ไขภายหลังได้ทั้งหมด</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {/* 1. Info */}
          <Section n={1} title="ข้อมูลอีเวนต์" desc="ผู้ร่วมงานจะเห็นชื่อนี้เมื่อเปิดลิงก์">
            <label className="block">
              <span className="text-sm font-medium">
                ชื่ออีเวนต์ <span className="text-red-500">*</span>
              </span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={255}
                placeholder="เช่น งานรับปริญญา 2569, งานวิ่ง Mini Marathon"
                className={`${field} mt-2`}
              />
            </label>
            <label className="mt-4 block">
              <span className="text-sm font-medium">คำอธิบาย</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={5000}
                placeholder="วันที่ สถานที่ หรือข้อความถึงผู้ร่วมงาน (ไม่บังคับ)"
                className={`${field} mt-2 resize-none`}
              />
            </label>
          </Section>

          {/* 2. Access */}
          <Section n={2} title="ใครเข้าถึงได้" desc="ทุกอีเวนต์เข้าได้ผ่านลิงก์/QR เท่านั้น เลือกว่าจะเข้มงวดแค่ไหน">
            <div className="grid gap-3 sm:grid-cols-2">
              <Choice selected={!useCode} onClick={() => setUseCode(false)} title="มีลิงก์ก็เข้าได้" desc="สะดวกที่สุด เหมาะกับงานที่แจก QR หน้างาน" />
              <Choice
                selected={useCode}
                onClick={() => {
                  setUseCode(true);
                  if (!code) setCode(randomCode());
                }}
                title="ต้องใส่รหัสเข้าชม"
                desc="ปลอดภัยขึ้น ถ้าลิงก์หลุดออกไป คนนอกก็เข้าไม่ได้"
              />
            </div>
            {useCode && (
              <div className="fade-in mt-4 flex items-center gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                  maxLength={16}
                  className={`${field} max-w-[220px] font-mono tracking-[0.25em]`}
                  aria-label="รหัสเข้าชม"
                />
                <button type="button" onClick={() => setCode(randomCode())} className="rounded-full border border-line px-4 py-3 text-xs hover:bg-soft">
                  สุ่มใหม่
                </button>
                {!codeValid && <span className="text-xs text-red-600">4–16 ตัวอักษรหรือตัวเลข</span>}
              </div>
            )}

            <div className="mt-6 border-t border-line pt-5">
              <p className="text-sm font-medium">ผู้ร่วมงานเห็นรูปอะไรได้บ้าง</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Choice
                  selected={!album}
                  onClick={() => setAlbum(false)}
                  title="เฉพาะรูปที่มีตัวเอง"
                  desc="ค้นหาด้วยใบหน้าเท่านั้น เป็นส่วนตัวที่สุด"
                  badge="แนะนำ"
                />
                <Choice selected={album} onClick={() => setAlbum(true)} title="ดูอัลบั้มทั้งหมดได้" desc="ทุกคนที่เข้าได้จะเห็นทุกรูปในงาน" />
              </div>
            </div>
          </Section>

          {/* 3. Retention */}
          <Section n={3} title="เก็บข้อมูลนานเท่าไร" desc="เมื่อครบกำหนด รูปและข้อมูลใบหน้าของงานนี้จะถูกลบถาวรอัตโนมัติ (PDPA)">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {RETENTION.map((r) => (
                <button
                  type="button"
                  key={r.days}
                  onClick={() => setRetention(r.days)}
                  aria-pressed={retention === r.days}
                  className={`rounded-2xl border px-3 py-3 text-left transition ${
                    retention === r.days ? "border-ink bg-ink text-white" : "border-line hover:border-[#cfcfcf]"
                  }`}
                >
                  <span className="block text-sm font-medium">{r.label}</span>
                  <span className={`text-[11px] ${retention === r.days ? "text-white/70" : "text-muted"}`}>{r.hint || " "}</span>
                </button>
              ))}
            </div>
            <p className={`mt-4 rounded-2xl p-3 text-sm ${retention ? "bg-soft text-muted" : "bg-amber-50 text-amber-800"}`}>
              {deleteOn ? (
                <>
                  ข้อมูลจะถูกลบวันที่ <span className="font-medium text-ink">{deleteOn}</span>
                </>
              ) : (
                "ข้อมูลใบหน้าจะถูกเก็บไว้จนกว่าคุณจะลบอีเวนต์เอง — ควรแจ้งผู้ร่วมงานถึงระยะเวลาเก็บข้อมูล"
              )}
            </p>
          </Section>
        </div>

        {/* ---------- summary / preview ---------- */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-[28px] border border-line p-5">
            <p className="text-xs text-muted">ตัวอย่างที่ผู้ร่วมงานเห็น</p>
            <div className="mt-3 rounded-2xl bg-gradient-to-b from-white to-soft p-5 text-center ring-1 ring-line">
              <p className="text-[11px] text-muted">อีเวนต์</p>
              <p className="mt-0.5 truncate font-semibold">{name.trim() || "ชื่ออีเวนต์"}</p>
              <RupRaoMark size={56} className="mx-auto mt-4" />
              <p className="mt-3 text-sm font-medium">ค้นหารูปของคุณด้วยใบหน้า</p>
              {useCode && <p className="mt-2 text-[11px] text-muted">🔒 ต้องใส่รหัสเข้าชมก่อน</p>}
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              <SummaryRow ok={!!name.trim()} text={name.trim() ? "ตั้งชื่อแล้ว" : "ยังไม่ได้ตั้งชื่อ"} />
              <SummaryRow ok text={useCode ? `รหัสเข้าชม ${code || "—"}` : "ไม่มีรหัสเข้าชม"} />
              <SummaryRow ok text={album ? "อัลบั้มเปิด" : "เห็นเฉพาะรูปตัวเอง"} />
              <SummaryRow ok={retention !== 0} text={deleteOn ? `ลบ ${deleteOn}` : "ไม่ลบอัตโนมัติ"} />
            </ul>
            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-5 w-full rounded-full bg-ink py-3 text-sm font-medium text-white transition hover:bg-black/80 disabled:opacity-30"
            >
              {saving ? "กำลังสร้าง…" : "สร้างอีเวนต์"}
            </button>
            <button type="button" onClick={cancel} className="mt-2 w-full rounded-full py-2.5 text-sm text-muted hover:text-ink">
              ยกเลิก
            </button>
          </div>
          <p className="mt-4 px-2 text-xs leading-relaxed text-muted">
            ขั้นต่อไป: อัปโหลดรูป → ระบบสแกนใบหน้าอัตโนมัติ → แชร์ลิงก์หรือ QR ให้ผู้ร่วมงาน ·{" "}
            <Link href="/privacy" target="_blank" className="underline underline-offset-4">
              นโยบายความเป็นส่วนตัว
            </Link>
          </p>
        </aside>
      </div>
    </form>
  );
}

function Section({ n, title, desc, children }: { n: number; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-line p-5 sm:p-6">
      <div className="flex gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-white">{n}</span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-muted">{desc}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Choice({
  selected,
  onClick,
  title,
  desc,
  badge,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex gap-3 rounded-2xl border p-4 text-left transition ${selected ? "border-ink ring-1 ring-ink" : "border-line hover:border-[#cfcfcf]"}`}
    >
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${selected ? "border-ink" : "border-[#cfcfcf]"}`}>
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-ink" />}
      </span>
      <span>
        <span className="flex items-center gap-2 text-sm font-medium">
          {title}
          {badge && <span className="rounded-full bg-soft px-2 py-0.5 text-[10px] font-medium text-muted">{badge}</span>}
        </span>
        <span className="mt-0.5 block text-xs text-muted">{desc}</span>
      </span>
    </button>
  );
}

function SummaryRow({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`grid h-4 w-4 place-items-center rounded-full text-[9px] text-white ${ok ? "bg-emerald-500" : "bg-amber-400"}`}>{ok ? "✓" : "!"}</span>
      <span className="text-muted">{text}</span>
    </li>
  );
}
