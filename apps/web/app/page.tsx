"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BRAND_ASSETS, ScanningMark } from "@/components/brand";
import { parseShareToken } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const token = parseShareToken(value);
    if (!token) return setError(true);
    router.push(`/e/${token}`);
  };

  return (
    <div className="mx-auto max-w-xl px-4 pb-24 pt-20 text-center sm:px-6 sm:pt-28">
      <div className="mx-auto mb-8 grid place-items-center">
        <ScanningMark size={112} />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={BRAND_ASSETS.wordmark} alt="รูปเรา RupRao" className="mx-auto h-11 w-auto sm:h-14" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">หารูปของคุณเจอในไม่กี่วินาที</h1>
      <p className="mt-3 text-[15px] text-muted">
        สแกน QR code หรือเปิดลิงก์ที่ได้จากผู้จัดงาน
        <br className="hidden sm:block" /> หรือพิมพ์รหัสอีเวนต์ด้านล่าง
      </p>

      <form onSubmit={go} className="mx-auto mt-10 flex max-w-md gap-2 rounded-full border border-line p-1.5 transition focus-within:border-ink">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          placeholder="รหัสอีเวนต์ หรือวางลิงก์"
          autoCapitalize="none"
          autoCorrect="off"
          className="min-w-0 flex-1 bg-transparent px-4 text-[15px] outline-none"
        />
        <button className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-black/80">
          ไปต่อ
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-red-600">รหัสไม่ถูกต้อง ลองตรวจสอบอีกครั้ง</p>}

      <div className="mx-auto mt-16 grid max-w-lg gap-6 text-left sm:grid-cols-3">
        {[
          ["1", "เปิดลิงก์อีเวนต์", "จาก QR code หรือลิงก์ของผู้จัดงาน"],
          ["2", "ถ่ายเซลฟี่", "หรือเลือกรูปที่เห็นหน้าชัด"],
          ["3", "รับรูปของคุณ", "ดาวน์โหลดทีละรูปหรือทั้งหมด"],
        ].map(([n, title, body]) => (
          <div key={n}>
            <span className="grid h-6 w-6 place-items-center rounded-full bg-soft text-xs font-medium">{n}</span>
            <p className="mt-3 text-sm font-medium">{title}</p>
            <p className="mt-0.5 text-xs text-muted">{body}</p>
          </div>
        ))}
      </div>

      <p className="mt-20 text-xs text-muted">
        เป็นผู้จัดงาน?{" "}
        <Link href="/admin" className="text-ink underline-offset-4 hover:underline">
          เข้าสู่ระบบจัดการอีเวนต์
        </Link>
      </p>
    </div>
  );
}
