"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Facing = "user" | "environment";

/** Full-screen live camera with a face guide. getUserMedia needs a secure context (https or localhost). */
export default function CameraCapture({ onCapture, onClose }: { onCapture: (f: File) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>("user");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canSwitch, setCanSwitch] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("เบราว์เซอร์นี้เปิดกล้องไม่ได้ (ต้องใช้ https หรือ localhost) — ใช้ปุ่มเลือกรูปแทนได้");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      })
      .then(async (stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        stop();
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        setCanSwitch(devices.filter((d) => d.kind === "videoinput").length > 1);
      })
      .catch((e: DOMException) => {
        if (cancelled) return;
        setError(
          e.name === "NotAllowedError"
            ? "ไม่ได้รับอนุญาตให้ใช้กล้อง — เปิดสิทธิ์กล้องในเบราว์เซอร์แล้วลองใหม่"
            : e.name === "NotFoundError"
              ? "ไม่พบกล้องในอุปกรณ์นี้"
              : "เปิดกล้องไม่สำเร็จ",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [facing]);

  // Release the camera when the modal closes.
  useEffect(() => stop, []);

  const close = useCallback(() => {
    stop();
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);

  const snap = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    // Save un-mirrored for the front camera, matching what others see.
    ctx.drawImage(video, 0, 0);
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        stop();
        onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  }, [onCapture]);

  // 3-second self-timer, handy when holding the phone at arm's length.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      snap();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, snap]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true">
      <div className="flex h-14 shrink-0 items-center justify-between px-4 sm:px-6">
        <p className="text-sm font-medium">ถ่ายเซลฟี่</p>
        <button
          onClick={close}
          aria-label="ปิด"
          className="grid h-9 w-9 place-items-center rounded-full text-xl text-muted transition hover:bg-soft hover:text-ink"
        >
          ×
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-8">
        <div className="relative aspect-[3/4] h-full max-h-[70vh] max-w-full overflow-hidden rounded-[32px] bg-soft">
          <video
            ref={videoRef}
            playsInline
            muted
            onLoadedData={() => setReady(true)}
            className={`h-full w-full object-cover transition-opacity duration-500 ${ready ? "opacity-100" : "opacity-0"} ${
              facing === "user" ? "-scale-x-100" : ""
            }`}
          />

          {!ready && !error && <div className="shimmer absolute inset-0" />}

          {ready && (
            <>
              {/* Face guide: soft vignette with an oval cut-out */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(ellipse 34% 30% at 50% 44%, transparent 98%, rgba(255,255,255,0.55) 100%)",
                }}
              />
              <div className="pointer-events-none absolute left-1/2 top-[44%] h-[60%] w-[68%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.06)]" />
              <p className="pointer-events-none absolute inset-x-0 bottom-5 text-center text-xs font-medium text-white drop-shadow">
                วางใบหน้าให้อยู่ในกรอบ มองตรง แสงสว่างพอ
              </p>
            </>
          )}

          {countdown !== null && countdown > 0 && (
            <div className="absolute inset-0 grid place-items-center">
              <span key={countdown} className="fade-in text-7xl font-semibold text-white drop-shadow-lg">
                {countdown}
              </span>
            </div>
          )}

          {flash && <div className="absolute inset-0 bg-white" />}

          {error && (
            <div className="absolute inset-0 grid place-items-center p-8 text-center">
              <div>
                <p className="text-sm text-ink">{error}</p>
                <button onClick={close} className="mt-4 rounded-full border border-line px-4 py-2 text-sm hover:bg-white">
                  กลับไปเลือกรูป
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex w-full max-w-xs items-center justify-between">
          <button
            onClick={() => setCountdown(3)}
            disabled={!ready || countdown !== null}
            className="grid h-11 w-11 place-items-center rounded-full border border-line text-xs font-medium text-muted transition hover:text-ink disabled:opacity-30"
            aria-label="ตั้งเวลา 3 วินาที"
            title="ตั้งเวลา 3 วินาที"
          >
            3s
          </button>

          <button
            onClick={snap}
            disabled={!ready || countdown !== null}
            aria-label="ถ่ายรูป"
            className="group grid h-[72px] w-[72px] place-items-center rounded-full border-[3px] border-ink/90 transition disabled:opacity-30"
          >
            <span className="h-[56px] w-[56px] rounded-full bg-ink transition group-hover:scale-95 group-active:scale-90" />
          </button>

          <button
            onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
            disabled={!canSwitch}
            className="grid h-11 w-11 place-items-center rounded-full border border-line text-muted transition hover:text-ink disabled:opacity-30"
            aria-label="สลับกล้อง"
            title="สลับกล้อง"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20 4v4h-4M4 20v-4h4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
