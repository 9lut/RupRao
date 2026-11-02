import Link from "next/link";
import { ScanningMark } from "./brand";

/** Shared "nothing here" screen: the 404 page and unknown / expired event links. */
export default function NotFoundView({
  title = "ไม่พบหน้านี้",
  body = "ลิงก์อาจพิมพ์ผิด ถูกย้าย หรือหมดอายุแล้ว — ไม่เป็นไร เราช่วยหารูปของคุณได้เสมอ",
  code = "404",
}: {
  title?: string;
  body?: string;
  code?: string;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <div className="relative">
        <ScanningMark size={120} />
        <span className="absolute -right-3 -top-2 rounded-full bg-ink px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wider text-white">
          {code}
        </span>
      </div>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{body}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <Link href="/" className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink/85">
          ใส่รหัสอีเวนต์
        </Link>
        <Link href="/privacy" className="rounded-full border border-line px-5 py-2.5 text-sm transition hover:bg-soft">
          ช่วยเหลือ
        </Link>
      </div>
      <p className="mt-10 text-xs text-muted">มีลิงก์หรือ QR จากผู้จัดงาน? เปิดลิงก์นั้นอีกครั้ง หรือขอลิงก์ใหม่จากผู้จัดงาน</p>
    </div>
  );
}
