"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { AdminEvent } from "@/lib/api";
import { useConfirm } from "./Confirm";

export default function ShareCard({ event, onRotate }: { event: AdminEvent; onRotate: () => Promise<void> }) {
  const confirm = useConfirm();
  const [origin, setOrigin] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const link = origin ? `${origin}/e/${event.share_token}` : "";

  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { width: 640, margin: 1, color: { dark: "#0a0a0a", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [link]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const rotate = async () => {
    const ok = await confirm({
      title: "สร้างลิงก์ใหม่?",
      message: "ใช้เมื่อลิงก์หลุดไปถึงคนที่ไม่ควรเข้าถึง",
      details: ["ลิงก์และ QR code เดิมจะใช้ไม่ได้ทันที", "ต้องพิมพ์ / แชร์ QR ใหม่ให้ผู้ร่วมงาน", "รูปและข้อมูลทั้งหมดยังอยู่ครบ"],
      confirmLabel: "สร้างลิงก์ใหม่",
      tone: "danger",
    });
    if (!ok) return;
    await onRotate();
  };

  return (
    <div className="grid gap-6 rounded-3xl border border-line p-5 sm:grid-cols-[180px_1fr] sm:p-6">
      <div className="mx-auto w-[180px]">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="QR code" className="aspect-square w-full rounded-2xl border border-line p-2" />
        ) : (
          <div className="shimmer aspect-square w-full rounded-2xl" />
        )}
      </div>
      <div className="flex min-w-0 flex-col justify-center">
        <p className="text-sm font-medium">ลิงก์สำหรับผู้ร่วมงาน</p>
        <p className="mt-1 text-xs text-muted">
          ผู้ร่วมงานค้นหารูปได้เฉพาะในอีเวนต์นี้เท่านั้น
          {event.access_code ? " และต้องใส่รหัสเข้าชม" : ""}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-full bg-soft px-4 py-2 text-xs">{link}</code>
          <button onClick={copy} className="shrink-0 rounded-full bg-ink px-4 py-2 text-xs font-medium text-white">
            {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="text-muted">
            รหัสอีเวนต์ <span className="font-mono font-medium text-ink">{event.share_token}</span>
          </span>
          {event.access_code && (
            <span className="text-muted">
              รหัสเข้าชม <span className="font-mono font-medium text-ink">{event.access_code}</span>
            </span>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {qr && (
            <a href={qr} download={`qr-${event.share_token}.png`} className="rounded-full border border-line px-3 py-1.5 hover:bg-soft">
              ดาวน์โหลด QR
            </a>
          )}
          <a href={link} target="_blank" rel="noreferrer" className="rounded-full border border-line px-3 py-1.5 hover:bg-soft">
            เปิดหน้าค้นหา ↗
          </a>
          <button onClick={rotate} className="rounded-full border border-line px-3 py-1.5 text-muted hover:text-ink">
            สร้างลิงก์ใหม่
          </button>
        </div>
      </div>
    </div>
  );
}
