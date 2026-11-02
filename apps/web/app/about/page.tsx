import type { Metadata } from "next";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import { BRAND_ASSETS, deploymentCredits, RupRaoMark } from "@/components/brand";

export const metadata: Metadata = { title: "เกี่ยวกับเรา · รูปเรา (RupRao)" };
// The credit comes from the server's environment, so render per request rather than at build.
export const dynamic = "force-dynamic";

const STEPS = [
  { n: "1", title: "ผู้จัดงานอัปโหลดรูป", body: "AI สแกนใบหน้าในทุกรูปอัตโนมัติ ไม่ต้องแท็กชื่อทีละคน" },
  { n: "2", title: "แชร์ลิงก์หรือ QR", body: "ผู้ร่วมงานเปิดลิงก์ของงาน แล้วถ่ายเซลฟี่หนึ่งรูป" },
  { n: "3", title: "เจอรูปของตัวเองทันที", body: "เลือกรูปที่ชอบ แล้วดาวน์โหลดทีละรูปหรือทั้งหมดในครั้งเดียว" },
];

const PROMISES = [
  { title: "เซลฟี่ไม่ถูกเก็บ", body: "ใช้ค้นหาในหน่วยความจำแล้วทิ้งทันที" },
  { title: "ค้นหาได้เฉพาะในงาน", body: "ต้องมีลิงก์ของงาน ค้นหาข้ามงานไม่ได้" },
  { title: "ลบเองได้ตามกำหนด", body: "ข้อมูลของงานถูกลบอัตโนมัติเมื่อครบกำหนด" },
  { title: "ขอลบรูปได้เสมอ", body: "ผู้ร่วมงานส่งคำขอลบรูปของตัวเองได้ทุกเมื่อ" },
];

export default function AboutPage() {
  const credits = deploymentCredits();
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <BackButton />

      {/* ---------- hero ---------- */}
      <section className="pt-10 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND_ASSETS.logo} alt="รูปเรา RupRao" className="mx-auto h-40 w-auto sm:h-48" />
        <h1 className="mt-8 text-3xl font-semibold tracking-tight sm:text-4xl">ทุกคนในงาน ควรได้รูปของตัวเอง</h1>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
          งานหนึ่งงานมีรูปเป็นร้อยเป็นพัน การไล่หารูปตัวเองในอัลบั้มทั้งหมดเหนื่อยและเสียเวลา{" "}
          <span className="font-medium text-ink">รูปเรา</span> ใช้ AI จดจำใบหน้า ให้ทุกคนเจอรูปของตัวเองในไม่กี่วินาที
          ด้วยเซลฟี่เพียงรูปเดียว
        </p>
      </section>

      {/* ---------- how ---------- */}
      <section className="mt-20">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">How it works</p>
        <h2 className="mt-2 text-xl font-semibold">ทำงานอย่างไร</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-3xl border border-line p-5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-sm font-semibold text-white">{s.n}</span>
              <p className="mt-4 font-medium">{s.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- privacy promises ---------- */}
      <section className="mt-16">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Privacy first</p>
        <h2 className="mt-2 text-xl font-semibold">ความเป็นส่วนตัวมาก่อน</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {PROMISES.map((p) => (
            <div key={p.title} className="flex gap-3 rounded-2xl bg-soft p-4">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-white">✓</span>
              <div>
                <p className="text-sm font-medium">{p.title}</p>
                <p className="mt-0.5 text-xs text-muted">{p.body}</p>
              </div>
            </div>
          ))}
        </div>
        <Link href="/privacy" className="mt-4 inline-block text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          อ่านนโยบายความเป็นส่วนตัวฉบับเต็ม →
        </Link>
      </section>

      {/* ---------- developer ---------- */}
      <section className="mt-16">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Made by</p>
        <h2 className="mt-2 text-xl font-semibold">ผู้พัฒนา</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          ออกแบบและพัฒนา รูปเรา (RupRao) ตั้งแต่ระบบ AI จดจำใบหน้า หลังบ้าน ไปจนถึงหน้าตาที่คุณใช้อยู่ —
          เพื่อให้ทุกงานแจกรูปได้ง่าย และทุกคนได้รูปของตัวเองอย่างปลอดภัย
        </p>
        <div className="mt-6 space-y-4">
          {credits.map((credit) => (
            <div
              key={credit.name}
              className="flex flex-col items-center gap-5 rounded-[32px] border border-line bg-gradient-to-b from-white to-soft p-8 text-center sm:flex-row sm:text-left"
            >
              {credit.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={credit.photo} alt={credit.name} className="h-24 w-24 shrink-0 rounded-full object-cover ring-4 ring-white shadow-md" />
              ) : (
                <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full bg-white ring-1 ring-line">
                  <RupRaoMark size={68} />
                </div>
              )}
              <div>
                <p className="text-sm text-muted">พัฒนาโดย</p>
                <p className="mt-0.5 text-2xl font-semibold tracking-tight">{credit.name}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- cta ---------- */}
      <section className="mt-16 text-center">
        <p className="text-sm text-muted">มีลิงก์หรือ QR จากผู้จัดงานแล้ว?</p>
        <Link href="/" className="mt-3 inline-block rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition hover:bg-black/80">
          เริ่มค้นหารูปของคุณ
        </Link>
      </section>
    </div>
  );
}
