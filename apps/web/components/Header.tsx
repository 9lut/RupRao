"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { session } from "@/lib/api";
import { Logo } from "./icons";

export default function Header() {
  const pathname = usePathname();
  const inAdmin = pathname.startsWith("/admin") && !pathname.startsWith("/admin/login");
  // Event pages use a wide desktop layout; keep the header aligned with it.
  const wide = pathname.startsWith("/e/");

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur">
      <div
        className={`mx-auto flex h-14 items-center justify-between px-4 sm:px-6 ${wide ? "max-w-[1440px] lg:px-8" : "max-w-6xl"}`}
      >
        <Link href={inAdmin ? "/admin" : "/"} className="flex items-center gap-2">
          <Logo />
          {inAdmin && <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] font-medium text-muted">ผู้จัดงาน</span>}
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {inAdmin ? (
            <>
              <Link
                href="/admin"
                className={`rounded-full px-3 py-1.5 transition ${pathname === "/admin" ? "bg-soft text-ink" : "text-muted hover:text-ink"}`}
              >
                อีเวนต์
              </Link>
              <button
                onClick={() => {
                  session.clear();
                  location.href = "/admin/login";
                }}
                className="rounded-full px-3 py-1.5 text-muted transition hover:text-ink"
              >
                ออกจากระบบ
              </button>
            </>
          ) : (
            [
              { href: "/about", label: "เกี่ยวกับเรา" },
              { href: "/privacy", label: "ความเป็นส่วนตัว" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-3 py-1.5 transition ${pathname === l.href ? "bg-soft text-ink" : "text-muted hover:text-ink"}`}
              >
                {l.label}
              </Link>
            ))
          )}
        </nav>
      </div>
    </header>
  );
}
