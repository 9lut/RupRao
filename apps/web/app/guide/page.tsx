import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "วิธีใช้งาน · รูปเรา (RupRao)",
  description: "คู่มือใช้งานรูปเรา: ผู้ร่วมงานหารูปตัวเองด้วยใบหน้า ผู้จัดงานสร้างอีเวนต์ อัปโหลดรูป และแชร์ QR",
};

/* ------------------------------------------------------------------ frames */

function PhoneShot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="mx-auto w-full max-w-[230px] rounded-[34px] bg-ink p-1.5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.45)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={600} height={1298} loading="lazy" className="block h-auto w-full rounded-[28px]" />
    </div>
  );
}

function BrowserShot({ src, alt, url = "photos.example.com/admin" }: { src: string; alt: string; url?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_30px_60px_-35px_rgba(0,0,0,0.35)]">
      <div className="flex items-center gap-2 border-b border-line bg-soft px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 truncate rounded-full bg-white px-3 py-0.5 text-[11px] text-muted">{url}</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={1440} height={900} loading="lazy" className="block h-auto w-full" />
    </div>
  );
}

function MockFrame({ children, url = "photos.example.com/admin" }: { children: React.ReactNode; url?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_30px_60px_-35px_rgba(0,0,0,0.35)]" aria-hidden>
      <div className="flex items-center gap-2 border-b border-line bg-soft px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 truncate rounded-full bg-white px-3 py-0.5 text-[11px] text-muted">{url}</span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ mock screens for newer features */

function CullMock() {
  const items = [
    { p: 0, tags: ["ไฟล์ซ้ำ"], out: true },
    { p: 1, tags: [], out: false },
    { p: 2, tags: ["เบลอ"], out: true },
    { p: 3, tags: [], out: false },
    { p: 4, tags: ["ภาพคล้ายกัน"], out: true },
    { p: 5, tags: ["มืดเกินไป"], out: true },
  ];
  return (
    <MockFrame>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">ตรวจแล้ว 120 รูป · จะอัปโหลด 96 รูป</p>
          <p className="mt-1 text-[11px] text-muted">
            คัดออก 24 รูป ประหยัด 186 MB
            {["ไฟล์ซ้ำ 9", "ภาพคล้ายกัน 7", "เบลอ 6", "มืดเกินไป 2"].map((t) => (
              <span key={t} className="ml-1.5 inline-block rounded-full bg-soft px-2 py-0.5">
                {t}
              </span>
            ))}
          </p>
        </div>
        <span className="rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-white">อัปโหลด 96 รูป</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
        {["ทุกเหตุผล 24", "ไฟล์ซ้ำ 9", "ภาพคล้ายกัน 7", "เบลอ 6", "มืดเกินไป 2"].map((t, i) => (
          <span key={t} className={`rounded-full px-2 py-0.5 ${i === 3 ? "bg-ink text-white" : "bg-soft text-muted"}`}>
            {t}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-soft/70 px-2.5 py-1.5">
        <span className="text-[10px] text-muted">Shift + คลิก เพื่อเปลี่ยนทั้งช่วง</span>
        <span className="flex gap-1">
          <span className="rounded-full border border-line bg-white px-2 py-0.5 text-[10px] font-medium">เก็บทั้งหมด (6)</span>
          <span className="rounded-full border border-red-200 bg-white px-2 py-0.5 text-[10px] font-medium text-red-600">คัดออกทั้งหมด (6)</span>
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {items.map((it, i) => (
          <div key={i} className={`relative aspect-square overflow-hidden rounded-xl ring-2 ${it.out ? "ring-red-300" : "ring-transparent"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/guide/people${it.p}.webp`} alt="" className={`h-full w-full object-cover ${it.out ? "opacity-50 grayscale" : ""} ${it.tags[0] === "เบลอ" ? "blur-[2px]" : ""} ${it.tags[0] === "มืดเกินไป" ? "brightness-[0.35]" : ""}`} />
            <span className="absolute left-1 top-1 flex flex-wrap gap-1">
              {it.tags.map((t) => (
                <span key={t} className="rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
                  {t}
                </span>
              ))}
            </span>
            <span className={`absolute bottom-1 right-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${it.out ? "bg-red-500 text-white" : "bg-white text-ink"}`}>
              {it.out ? "คัดออก" : "เก็บ"}
            </span>
          </div>
        ))}
      </div>
    </MockFrame>
  );
}

function ThemeMock() {
  return (
    <MockFrame>
      <div className="overflow-hidden rounded-xl border border-line">
        <div className="relative h-36 bg-[linear-gradient(180deg,#6a93db,#e3d8f8)]">
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-[#f4effa]" />
          <div className="absolute inset-x-0 top-2 flex justify-between px-3 text-[10px] text-white">
            <span className="font-semibold">GF7</span>
            <span>เกี่ยวกับเรา · ความเป็นส่วนตัว</span>
          </div>
          <div className="relative flex h-full flex-col items-center justify-center text-white">
            <p className="text-xl font-bold [text-shadow:0_2px_12px_rgba(0,0,0,0.35)]">ค่ายเยาวชน</p>
            <div className="mt-2 flex gap-1.5">
              {["Facebook", "Instagram", "LINE"].map((l) => (
                <span key={l} className="rounded-full bg-white/25 px-2 py-0.5 text-[9px] ring-1 ring-white/40">
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-[#f4effa] p-3">
          <span className="rounded-full bg-[#3d2c63] px-3 py-1 text-[10px] text-white">ถ่ายภาพใบหน้า</span>
          <span className="rounded-full border border-[#e7dff3] bg-white px-3 py-1 text-[10px]">ใช้ภาพใบหน้า</span>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-medium">สีธีม</p>
          <div className="mt-1.5 flex gap-1.5">
            {["#8f6ed5", "#e06c96", "#d64545", "#e8833a", "#3f9a6b", "#1f8fc9", "#2b2b2b"].map((c, i) => (
              <span key={c} className={`h-6 w-6 rounded-full ${i === 0 ? "ring-2 ring-ink ring-offset-2" : ""}`} style={{ background: c }} />
            ))}
          </div>
        </div>
        <div>
          <p className="text-[11px] font-medium">ฟอนต์ชื่องาน</p>
          <div className="mt-1.5 flex gap-1.5 text-[10px]">
            {["มาตรฐาน", "Kanit", "Prompt", "Charm"].map((f, i) => (
              <span key={f} className={`rounded-lg border px-2 py-1 ${i === 1 ? "border-ink" : "border-line"}`}>
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>
    </MockFrame>
  );
}

/* ------------------------------------------------------------------ layout pieces */

function Step({
  n,
  title,
  children,
  media,
  phone = false,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
  media?: React.ReactNode;
  phone?: boolean;
}) {
  return (
    <li className={`grid items-center gap-6 py-8 sm:py-10 ${media ? (phone ? "md:grid-cols-[1fr_280px]" : "md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]") : ""}`}>
      <div>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-sm font-semibold text-white">{n}</span>
        <h3 className="mt-3 text-lg font-semibold tracking-tight sm:text-xl">{title}</h3>
        <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-muted [&_b]:font-medium [&_b]:text-ink">{children}</div>
      </div>
      {media && <div className={phone ? "order-first md:order-none" : ""}>{media}</div>}
    </li>
  );
}

/** Attendee steps: phone screenshot on top, short text below, laid out as a grid of cards. */
function PhoneStep({ n, title, src, alt, children }: { n: number; title: string; src: string; alt: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col">
      <div className="relative">
        <PhoneShot src={src} alt={alt} />
        <span className="absolute -left-1 -top-2 grid h-9 w-9 place-items-center rounded-full bg-accent text-sm font-semibold text-white shadow-lg ring-4 ring-white">
          {n}
        </span>
      </div>
      <h3 className="mt-5 text-base font-semibold tracking-tight">{title}</h3>
      <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-muted [&_b]:font-medium [&_b]:text-ink">{children}</div>
    </li>
  );
}

function Tip({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  return (
    <p className={`rounded-2xl px-4 py-3 text-sm ${tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-soft text-ink"}`}>
      {tone === "warn" ? "⚠️ " : "💡 "}
      {children}
    </p>
  );
}

function Section({ id, eyebrow, title, intro, children }: { id: string; eyebrow: string; title: string; intro: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-line pt-12 sm:pt-16">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-[15px] text-muted">{intro}</p>
      {children}
    </section>
  );
}

const FAQ: [string, string][] = [
  ["เซลฟี่ของฉันถูกเก็บไว้ไหม?", "ไม่ถูกเก็บ รูปเซลฟี่ใช้เปรียบเทียบใบหน้าในหน่วยความจำแล้วทิ้งทันที ระบบเก็บเฉพาะรูปในงานที่ผู้จัดอัปโหลดเท่านั้น"],
  ["ทำไมหารูปตัวเองไม่เจอ?", "ลองใช้รูปที่หน้าตรง แสงสว่างพอ ไม่ใส่แว่นกันแดดหรือหน้ากาก ถ้ายังไม่เจอ อาจเป็นเพราะผู้จัดยังอัปโหลดรูปไม่ครบ หรือระบบยังสแกนรูปใหม่ไม่เสร็จ ลองกลับมาค้นหาอีกครั้งภายหลัง"],
  ["เจอรูปที่ไม่ใช่ตัวเองปนมา ทำอย่างไร?", "เปิดรูปนั้นแล้วกด “ไม่ใช่ฉัน” รูปจะถูกซ่อนจากผลค้นหาของคุณ ถ้าเจอบ่อย แจ้งผู้จัดงานให้ปรับ “ความใกล้เคียงขั้นต่ำ” ในหน้าตั้งค่าให้สูงขึ้น"],
  ["อยากให้ลบรูปที่มีฉันออกจากระบบ", "ค้นหาด้วยใบหน้า → กด “ขอลบรูป” → เลือกรูป → “ส่งคำขอลบ” ผู้จัดงานจะตรวจสอบและลบรูปพร้อมข้อมูลใบหน้าในรูปนั้น"],
  ["รูปจะอยู่ในระบบนานแค่ไหน?", "ผู้จัดงานกำหนดวันลบอัตโนมัติของแต่ละอีเวนต์ได้ (ค่าเริ่มต้น 90 วัน) เมื่อถึงวันนั้น รูปและข้อมูลใบหน้าทั้งหมดของอีเวนต์จะถูกลบถาวร วันลบแสดงอยู่ในหน้าช่วยเหลือของอีเวนต์"],
  ["ผู้จัดงานลืมรหัสผ่าน", "ติดต่อผู้ดูแลระบบที่ให้บัญชีมา เพื่อรีเซ็ตรหัสผ่านใหม่"],
  ["ดาวน์โหลดรูปแล้วมีโลโก้ติดมา", "ผู้จัดงานเปิด “ลายน้ำ” ไว้ เพื่อใส่โลโก้งานบนรูปที่ดาวน์โหลด รูปต้นฉบับในระบบไม่ถูกแก้ไข"],
];

/* ------------------------------------------------------------------ page */

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
      {/* hero */}
      <header className="pb-10 pt-12 text-center sm:pt-16">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-accent">คู่มือใช้งาน</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">ใช้งานรูปเรา ง่าย ๆ ทีละขั้น</h1>
        <p className="mx-auto mt-4 max-w-xl text-[15px] text-muted">เลือกบทบาทของคุณด้านล่าง แต่ละขั้นมีภาพหน้าจอประกอบ ทำตามได้ทันที</p>
        <nav className="mx-auto mt-8 grid max-w-2xl gap-3 sm:grid-cols-2">
          {[
            { href: "#attendee", icon: "🙋", t: "ผู้ร่วมงาน", d: "หารูปตัวเองด้วยใบหน้า" },
            { href: "#organizer", icon: "📸", t: "ผู้จัดงาน", d: "สร้างอีเวนต์ อัปรูป แชร์ QR" },
          ].map((c) => (
            <a key={c.href} href={c.href} className="rounded-3xl border border-line bg-white p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-25px_rgba(0,0,0,0.3)]">
              <span className="text-2xl">{c.icon}</span>
              <span className="mt-2 block font-semibold">{c.t}</span>
              <span className="block text-sm text-muted">{c.d}</span>
            </a>
          ))}
        </nav>
      </header>

      {/* ============================================================ attendee */}
      <Section id="attendee" eyebrow="สำหรับผู้ร่วมงาน" title="หารูปตัวเองใน 1 นาที" intro="ไม่ต้องสมัครสมาชิก ไม่ต้องลงแอป ใช้แค่กล้องมือถือ">
        <ol className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          <PhoneStep n={1} title="สแกน QR ที่หน้างาน" src="/guide/qr.webp" alt="สแกน QR code จากโปสเตอร์หน้างาน">
            <p>
              เปิด<b>กล้องมือถือ</b> แล้วส่องไปที่ QR บนโปสเตอร์ หรือกดลิงก์ที่ผู้จัดงานส่งให้ใน LINE / Facebook
            </p>
            <p>ถ้างานมี<b>รหัสเข้าชม</b> ให้ใส่รหัสที่อยู่บนโปสเตอร์หรือที่ผู้จัดงานแจ้ง</p>
          </PhoneStep>
          <PhoneStep n={2} title="กด “ถ่ายภาพใบหน้า”" src="/guide/event.webp" alt="หน้าอีเวนต์ มีปุ่มถ่ายภาพใบหน้าและใช้ภาพใบหน้า">
            <p>
              กด <b>ถ่ายภาพใบหน้า</b> เพื่อเปิดกล้อง หรือกด <b>ใช้ภาพใบหน้า</b> เพื่อเลือกรูปที่มีอยู่ในเครื่อง
            </p>
            <p>บนคอมพิวเตอร์ ลากรูปมาวางในกรอบได้เลย</p>
          </PhoneStep>
          <PhoneStep n={3} title="ยินยอมการใช้ข้อมูลใบหน้า (ครั้งแรกครั้งเดียว)" src="/guide/consent.webp" alt="หน้าต่างขอความยินยอมก่อนค้นหา">
            <p>
              ติ๊กยินยอม แล้วกด <b>ยินยอมและเริ่มค้นหา</b> รูปเซลฟี่<b>ใช้ค้นหาเท่านั้น ไม่ถูกบันทึก</b>
            </p>
          </PhoneStep>
          <PhoneStep n={4} title="ถ่ายเซลฟี่ให้เห็นหน้าชัด" src="/guide/camera.webp" alt="หน้ากล้องถ่ายเซลฟี่ มีกรอบใบหน้า">
            <p>วางหน้าให้อยู่ในกรอบวงรี แล้วกดปุ่มชัตเตอร์</p>
            <Tip>หน้าตรง แสงสว่างพอ ถอดแว่นกันแดดและหน้ากาก จะเจอรูปมากขึ้น</Tip>
          </PhoneStep>
          <PhoneStep n={5} title="รอ AI ค้นหาสักครู่" src="/guide/scanning.webp" alt="หน้าจอกำลังสแกนใบหน้า">
            <p>ระบบเทียบใบหน้าคุณกับทุกรูปในงาน ปกติใช้เวลาไม่กี่วินาที</p>
            <p>ถ้าเซลฟี่มีหลายคน ระบบจะให้<b>แตะเลือกใบหน้าของตัวเอง</b>ก่อน</p>
          </PhoneStep>
          <PhoneStep n={6} title="ดูรูปที่มีคุณ" src="/guide/results.webp" alt="ผลการค้นหา แสดงรูปที่มีผู้ใช้">
            <p>แตะรูปเพื่อดูภาพใหญ่ · แตะ ♥ เพื่อเก็บไว้ในแท็บ “ถูกใจ”</p>
            <p>
              เจอรูปที่ไม่ใช่คุณ? เปิดรูปแล้วกด <b>ไม่ใช่ฉัน</b> เพื่อซ่อน
            </p>
          </PhoneStep>
          <PhoneStep n={7} title="เลือกหลายรูปแล้วดาวน์โหลดทีเดียว" src="/guide/select.webp" alt="โหมดเลือกหลายรูปพร้อมปุ่มดาวน์โหลด">
            <p>
              กด <b>เลือกหลายรูป</b> → ติ๊กรูปที่ต้องการ → <b>ดาวน์โหลด</b> จะได้ไฟล์ zip (ครั้งละไม่เกิน 100 รูป)
            </p>
            <p>หรือกด “ดาวน์โหลดทั้งหมด” บนคอมพิวเตอร์</p>
          </PhoneStep>
          <PhoneStep n={8} title="ไม่อยากให้รูปของคุณอยู่ในระบบ? ขอลบได้" src="/guide/remove_dialog.webp" alt="หน้าต่างส่งคำขอลบรูป">
            <p>
              กด <b>ขอลบรูป</b> → เลือกรูปที่มีคุณ → <b>ส่งคำขอลบ</b> ใส่ช่องทางติดต่อได้ถ้าต้องการ
            </p>
            <p>ผู้จัดงานจะตรวจสอบแล้วลบรูปพร้อมข้อมูลใบหน้าในรูปนั้นออก</p>
          </PhoneStep>
        </ol>
      </Section>

      {/* ============================================================ organizer */}
      <Section
        id="organizer"
        eyebrow="สำหรับผู้จัดงาน"
        title="จากรูปในกล้อง สู่ลิงก์ให้ผู้ร่วมงาน"
        intro="เข้าสู่ระบบที่ /admin ด้วยบัญชีผู้จัดงานที่ได้รับ แล้วทำตามนี้"
      >
        <ol className="divide-y divide-line">
          <Step n={1} title="สร้างอีเวนต์ใหม่" media={<BrowserShot src="/guide/admin_new.webp" alt="หน้าสร้างอีเวนต์ใหม่" url="photos.example.com/admin/events/new" />}>
            <p>
              กด <b>+ สร้างอีเวนต์</b> แล้วตั้งค่า 3 อย่าง:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <b>ชื่อและคำอธิบาย</b> ผู้ร่วมงานจะเห็นตอนเปิดลิงก์
              </li>
              <li>
                <b>ใครเข้าได้</b>: ใครมีลิงก์ก็เข้าได้ หรือต้องใส่รหัสเข้าชม
              </li>
              <li>
                <b>เก็บข้อมูลนานเท่าไร</b>: ครบกำหนดแล้วรูปและข้อมูลใบหน้าจะถูกลบอัตโนมัติ (ตาม PDPA)
              </li>
            </ul>
          </Step>
          <Step n={2} title="อัปโหลดรูป (ระบบคัดรูปซ้ำและรูปไม่ดีให้ก่อน)" media={<BrowserShot src="/guide/admin_upload.webp" alt="หน้าอัปโหลดรูปและรายการรูปที่กำลังสแกน" />}>
            <p>
              แท็บ <b>รูปภาพ</b> → ลากรูปทั้งโฟลเดอร์มาวาง หรือคลิกเพื่อเลือก (JPEG/PNG/WebP สูงสุด 20 MB ต่อรูป)
            </p>
            <p>หลังอัปโหลด AI จะสแกนใบหน้าให้เอง แต่ละรูปจะขึ้นจำนวนใบหน้าเมื่อสแกนเสร็จ</p>
          </Step>
          <Step n={3} title="ตรวจรูปที่ระบบคัดออก แล้วกดอัปโหลด" media={<CullMock />}>
            <p>
              ถ้าติ๊ก <b>คัดรูปซ้ำและรูปไม่ดีก่อนอัปโหลด</b> (เปิดไว้เป็นค่าเริ่มต้น) ระบบจะตรวจในเครื่องคุณก่อนส่ง:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <b>ไฟล์ซ้ำ / ภาพคล้ายกัน / มีในอีเวนต์แล้ว</b>: รูปที่ถ่ายรัว ๆ จะเก็บใบที่คมที่สุด
              </li>
              <li>
                <b>เบลอ มืดเกินไป สว่างจ้า ความละเอียดต่ำ</b>
              </li>
            </ul>
            <p>ตรวจแล้วปรับได้หลายแบบ:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <b>แตะรูป</b> เพื่อสลับ เก็บ / คัดออก ทีละรูป
              </li>
              <li>
                <b>Shift + คลิก</b> เพื่อเปลี่ยนทั้งช่วงในครั้งเดียว
              </li>
              <li>
                กรองตามเหตุผล เช่น <b>เบลอ</b> แล้วกด <b>เก็บทั้งหมด</b> หรือ <b>คัดออกทั้งหมด</b>
              </li>
              <li>
                เปลี่ยนใจ? กด <b>กลับเป็นค่าที่ระบบแนะนำ</b>
              </li>
            </ul>
            <p>
              เสร็จแล้วกด <b>อัปโหลด</b> ช่วยประหยัดพื้นที่และเวลาอัปโหลดได้มาก
            </p>
          </Step>
          <Step n={4} title="แชร์ลิงก์ หรือพิมพ์โปสเตอร์ QR" media={<BrowserShot src="/guide/admin_share.webp" alt="หน้าแชร์ลิงก์และ QR code" />}>
            <p>
              แท็บ <b>แชร์ / QR</b>: คัดลอกลิงก์ส่งในกลุ่ม หรือกด <b>พิมพ์โปสเตอร์ QR</b> จะได้โปสเตอร์ A4/A5 ที่ใช้สีและโลโก้ของงาน พร้อมพิมพ์หรือบันทึกเป็น PDF
            </p>
            <Tip tone="warn">ถ้าลิงก์หลุดไปถึงคนที่ไม่ควรเห็น กด “สร้างลิงก์ใหม่” ลิงก์และ QR เดิมจะใช้ไม่ได้ทันที</Tip>
          </Step>
          <Step n={5} title="ตกแต่งหน้าอัลบั้มให้เป็นของงานคุณ" media={<ThemeMock />}>
            <p>
              แท็บ <b>ตั้งค่า</b> → <b>หน้าตาอัลบั้ม</b> ปรับได้เฉพาะอีเวนต์นี้:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>รูปปกแบนเนอร์ (ลากจัดตำแหน่ง ซูมได้) · โลโก้งาน · ไอคอนและชื่อแท็บ</li>
              <li>สีธีม (เลือกสีเดียว ระบบจัดชุดสีให้) หรือปรับทีละส่วน · ฟอนต์ชื่องาน</li>
              <li>ปุ่ม Facebook / IG / LINE · ข้อความต้อนรับหรือประกาศ</li>
              <li>ลายน้ำโลโก้บนรูปที่ผู้ร่วมงานดาวน์โหลด</li>
            </ul>
            <p>
              ดูตัวอย่างสดได้ทันที แล้วกด <b>บันทึกการตั้งค่า</b> (รูปจะอัปโหลดตอนกดบันทึก)
            </p>
          </Step>
          <Step n={6} title="ปรับความแม่นยำการค้นหา" >
            <p>
              ในแท็บ <b>ตั้งค่า</b> มี <b>ความใกล้เคียงขั้นต่ำ</b>: ค่าต่ำจะเจอรูปมากขึ้นแต่อาจปนคนอื่น ค่าสูงจะแม่นขึ้นแต่อาจตกหล่น
            </p>
            <p>
              กด <b>วิเคราะห์</b> ระบบจะดูรูปจริงในงานแล้วแนะนำค่าที่เหมาะสม กด “ใช้ค่านี้” แล้วบันทึก
            </p>
          </Step>
          <Step n={7} title="ดูแลคำขอลบรูป" media={<BrowserShot src="/guide/admin_requests.webp" alt="หน้ารายการคำขอลบรูป" />}>
            <p>
              เมื่อมีคำขอใหม่ แท็บ <b>คำขอลบ</b> จะขึ้นตัวเลขสีเหลือง ตรวจรูปแล้วกด <b>อนุมัติและลบรูป</b> หรือ <b>ปฏิเสธ</b>
            </p>
            <p>ควรดำเนินการโดยเร็วเพื่อให้สอดคล้องกับ PDPA</p>
          </Step>
        </ol>
      </Section>

      {/* ============================================================ FAQ */}
      <section id="faq" className="scroll-mt-20 border-t border-line pt-12 sm:pt-16">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">คำถามที่พบบ่อย</h2>
        <div className="mt-6 divide-y divide-line rounded-3xl border border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium">
                {q}
                <span className="text-muted transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-muted">
          อ่านเพิ่ม:{" "}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">
            ความเป็นส่วนตัวและข้อมูลใบหน้า
          </Link>
        </p>
      </section>
    </div>
  );
}
