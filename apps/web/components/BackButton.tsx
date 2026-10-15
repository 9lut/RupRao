"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const CUR = "rr_nav_cur";
const PREV = "rr_nav_prev";

/**
 * Remembers the previous in-app page for this tab. Client-side navigations don't update
 * document.referrer, so BackButton can't rely on it. Rendered once in the root layout.
 */
export function NavTracker() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      const cur = sessionStorage.getItem(CUR);
      if (cur && cur !== pathname) sessionStorage.setItem(PREV, cur);
      sessionStorage.setItem(CUR, pathname);
    } catch {}
  }, [pathname]);
  return null;
}

/** Goes back to the previous page in this site; falls back to `fallback` when opened directly / in a new tab. */
export default function BackButton({
  fallback = "/",
  label = "ย้อนกลับ",
}: {
  fallback?: string;
  label?: string;
}) {
  const router = useRouter();

  const goBack = () => {
    let prev: string | null = null;
    try {
      prev = sessionStorage.getItem(PREV);
    } catch {}
    const fromHere =
      (prev && prev !== location.pathname) ||
      (document.referrer &&
        new URL(document.referrer).origin === location.origin);
    if (fromHere && window.history.length > 1) router.back();
    else router.push(fallback);
  };

  return (
    <button
      type="button"
      onClick={goBack}
      className="inline-flex items-center gap-1.5 rounded-full py-1.5 pr-3 text-sm text-muted transition hover:text-ink"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {label}
    </button>
  );
}
