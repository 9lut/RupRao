"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { use, useEffect, useState } from "react";
import { bannerFrame } from "@/components/ThemeBanner";
import { adminApi, type AdminEvent } from "@/lib/api";
import { titleFontClass } from "@/lib/fonts";
import { asTheme, pageColor, THEMES, themeVars, type ThemeCustom } from "@/lib/themes";

type Size = "a4" | "a5";

/** Print-ready QR poster in the album's own colors, logo and banner. */
export default function PosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [event, setEvent] = useState<AdminEvent | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [size, setSize] = useState<Size>("a4");
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    adminApi.getEvent(id).then(setEvent).catch(() => setEvent(null));
  }, [id]);

  const theme = asTheme(event?.theme);
  const custom: ThemeCustom = event?.theme_custom ?? {};
  const ink = custom.ink ?? THEMES[theme].palette.ink;
  const link = event && origin ? `${origin}/e/${event.share_token}` : "";

  useEffect(() => {
    if (!link) return;
    // Error correction "H" keeps the code readable even printed small or slightly smudged.
    QRCode.toDataURL(link, { width: 1200, margin: 1, errorCorrectionLevel: "H", color: { dark: ink, light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [link, ink]);

  if (!event) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-10">
        <div className="shimmer h-[600px] rounded-3xl" />
      </div>
    );
  }

  const p = THEMES[theme].palette;
  const from = custom.banner_from ?? p.sky[0];
  const to = custom.banner_to ?? p.sky[1];
  const { x, y, zoom } = bannerFrame(custom);
  const bg = pageColor(theme, custom);
  const shortLink = link.replace(/^https?:\/\//, "");

  return (
    <div className="poster-root min-h-screen bg-soft pb-16">
      <style>{`
        @page { size: ${size === "a4" ? "A4" : "A5"} portrait; margin: 0; }
        @media print {
          header, .no-print { display: none !important; }
          html, body, .poster-root { background: #fff !important; }
          .poster-root { padding: 0 !important; }
          .poster-sheet { box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="no-print mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-6">
        <Link href={`/admin/events/${id}?tab=share`} className="text-sm text-muted hover:text-ink">
          ← กลับ
        </Link>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full bg-white p-1 text-xs shadow-sm">
            {(["a4", "a5"] as Size[]).map((s) => (
              <button key={s} onClick={() => setSize(s)} className={`rounded-full px-3 py-1 ${size === s ? "bg-ink text-white" : "text-muted"}`}>
                {s.toUpperCase()}
              </button>
            ))}
          </div>
          <button onClick={() => window.print()} className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-white hover:bg-ink/85">
            พิมพ์ / บันทึก PDF
          </button>
        </div>
      </div>

      {/* The sheet: 210 × 297 mm proportions; text sizes in cqw scale with it, on screen and on paper. */}
      <div
        className="poster-sheet @container relative mx-auto flex aspect-[210/297] w-full max-w-[794px] flex-col overflow-hidden bg-white shadow-[0_30px_80px_-30px_rgba(0,0,0,0.35)] sm:rounded-2xl"
        style={{ ...themeVars(theme, custom), background: bg, color: ink } as React.CSSProperties}
      >
        {/* banner */}
        <div className="relative h-[34%] shrink-0 overflow-hidden" style={{ background: `linear-gradient(180deg, ${from}, ${to})` }}>
          {event.banner_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.banner_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: `${x}% ${y}%`, transform: `scale(${zoom})`, transformOrigin: `${x}% ${y}%` }}
            />
          )}
          <div className="absolute inset-x-0 bottom-0 h-2/3" style={{ background: `linear-gradient(180deg, transparent, ${bg})` }} />
          <div className="relative flex h-full flex-col items-center justify-center px-[8%] pt-[4%] text-center" style={{ color: custom.title_color ?? "#ffffff" }}>
            {event.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.logo_url} alt="" className="mb-[3%] h-[26%] w-auto object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.3)]" />
            )}
            <h1
              className={`text-[6.2cqw] font-bold leading-[1.1] [text-shadow:0_2px_6px_rgba(0,0,0,0.25),0_6px_32px_rgba(0,0,0,0.35)] ${titleFontClass(custom.title_font)}`}
            >
              {event.name}
            </h1>
            {event.description && (
              <p className="mt-[2%] line-clamp-2 text-[2.2cqw] font-medium [text-shadow:0_1px_12px_rgba(0,0,0,0.4)]">{event.description}</p>
            )}
          </div>
        </div>

        {/* QR */}
        <div className="flex flex-1 flex-col items-center px-[8%] pt-[3%] text-center">
          <p className="text-[3.6cqw] font-semibold">สแกนเพื่อค้นหารูปของคุณ</p>
          <p className="mt-1 text-[1.8cqw] text-muted">ถ่ายเซลฟี่ ระบบหารูปที่มีคุณจากทั้งงานให้ทันที</p>
          <div className="mt-[4%] rounded-[6%] bg-white p-[2.5%] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.25)] ring-1 ring-line" style={{ width: "46%" }}>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR code" className="aspect-square w-full" />
            ) : (
              <div className="shimmer aspect-square w-full" />
            )}
          </div>
          <p className="mt-[3%] font-mono text-[1.8cqw] font-medium">{shortLink}</p>
          {event.access_code && (
            <p className="mt-[2%] rounded-full bg-soft px-[4%] py-[1%] text-[2cqw]">
              รหัสเข้าชม <span className="font-mono font-bold tracking-[0.2em]">{event.access_code}</span>
            </p>
          )}

          <ol className="mt-auto grid w-full grid-cols-3 gap-[3%] pb-[5%] pt-[4%] text-left">
            {[
              ["สแกน QR", "ด้วยกล้องมือถือ"],
              ["ถ่ายเซลฟี่", "หน้าตรง เห็นชัด"],
              ["บันทึกรูป", "เลือกแล้วดาวน์โหลด"],
            ].map(([t, d], i) => (
              <li key={t} className="flex items-start gap-[6%]">
                <span className="grid aspect-square w-[22%] shrink-0 place-items-center rounded-full bg-ink text-[1.8cqw] font-bold text-white">{i + 1}</span>
                <span>
                  <span className="block text-[1.9cqw] font-semibold">{t}</span>
                  <span className="block text-[1.4cqw] text-muted">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <p className="pb-[3%] text-center text-[1.2cqw] text-muted">ค้นหารูปด้วย รูปเรา RupRao · รูปเซลฟี่ใช้ค้นหาเท่านั้น ไม่ถูกบันทึก</p>
      </div>
    </div>
  );
}
