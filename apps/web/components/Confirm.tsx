"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = red confirm button for destructive / irreversible actions. */
  tone?: "default" | "danger";
  /** Ask the user to type this exact text before confirming (e.g. the event name). */
  requireText?: string;
  /** Extra bullet points shown in a box: what will happen. */
  details?: string[];
}

type Resolver = (ok: boolean) => void;
const Ctx = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

/** `const confirm = useConfirm(); if (await confirm({...})) …` */
export function useConfirm() {
  const fn = useContext(Ctx);
  if (!fn) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return fn;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<Resolver | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    resolver.current?.(false);
    setOpts(o);
    return new Promise<boolean>((resolve) => (resolver.current = resolve));
  }, []);

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {opts && <ConfirmDialog opts={opts} onClose={close} />}
    </Ctx.Provider>
  );
}

function ConfirmDialog({ opts, onClose }: { opts: ConfirmOptions; onClose: (ok: boolean) => void }) {
  const [typed, setTyped] = useState("");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const danger = opts.tone === "danger";
  const blocked = !!opts.requireText && typed.trim() !== opts.requireText.trim();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose(false);
    window.addEventListener("keydown", onKey);
    if (!opts.requireText) confirmRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, opts.requireText]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/25 p-4 backdrop-blur-sm" onClick={() => onClose(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="fade-in w-full max-w-sm rounded-3xl bg-white p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`mb-4 grid h-11 w-11 place-items-center rounded-full ${danger ? "bg-red-50 text-red-600" : "bg-soft text-ink"}`}>
          {danger ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 9v4M12 17h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          )}
        </div>
        <h2 id="confirm-title" className="text-lg font-semibold tracking-tight">
          {opts.title}
        </h2>
        {opts.message && <div className="mt-2 text-sm leading-relaxed text-muted">{opts.message}</div>}
        {opts.details && opts.details.length > 0 && (
          <ul className="mt-4 space-y-1.5 rounded-2xl bg-soft p-4 text-sm">
            {opts.details.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span className={danger ? "text-red-500" : "text-ink"}>•</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        )}
        {opts.requireText && (
          <label className="mt-4 block text-sm">
            <span className="text-muted">
              พิมพ์ <span className="font-medium text-ink">{opts.requireText}</span> เพื่อยืนยัน
            </span>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !blocked && onClose(true)}
              className="mt-2 w-full rounded-full border border-line px-4 py-2.5 text-sm outline-none focus:border-ink"
            />
          </label>
        )}
        <div className="mt-6 flex gap-2">
          <button onClick={() => onClose(false)} className="flex-1 rounded-full border border-line py-2.5 text-sm transition hover:bg-soft">
            {opts.cancelLabel ?? "ยกเลิก"}
          </button>
          <button
            ref={confirmRef}
            disabled={blocked}
            onClick={() => onClose(true)}
            className={`flex-1 rounded-full py-2.5 text-sm font-medium text-white transition disabled:opacity-30 ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-ink hover:bg-black/80"
            }`}
          >
            {opts.confirmLabel ?? "ยืนยัน"}
          </button>
        </div>
      </div>
    </div>
  );
}
