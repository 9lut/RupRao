"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { session } from "@/lib/api";
import { useAdminMe } from "@/lib/adminMe";
import { useEventBrand } from "@/lib/eventBrand";
import { Logo } from "./icons";

export default function Header() {
  const pathname = usePathname();
  const inAdmin = pathname.startsWith("/admin") && !pathname.startsWith("/admin/login");
  // Event pages use a wide desktop layout; keep the header aligned with it.
  const wide = pathname.startsWith("/e/");
  const eventBrand = useEventBrand();
  const me = useAdminMe();
  const brand = wide ? eventBrand : null;
  const overlay = !!brand?.overlay;
  const scrolled = useScrolled(overlay);
  // Over the banner photo: no background, white text. Turns solid once the page scrolls.
  const clear = overlay && !scrolled;
  const linkIdle = clear ? "text-white/85 hover:text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.4)]" : "text-muted hover:text-ink";

  return (
    <header
      data-overlay={overlay ? (clear ? "clear" : "solid") : undefined}
      className={`top-0 z-30 border-b transition-colors duration-300 ${overlay ? "fixed inset-x-0" : "sticky"} ${
        clear ? "border-transparent bg-transparent" : "border-line bg-white/85 backdrop-blur"
      }`}
    >
      <div
        className={`mx-auto flex h-14 items-center justify-between px-4 sm:px-6 ${wide ? "max-w-[1440px] lg:px-8" : "max-w-6xl"}`}
      >
        {brand?.logoUrl ? (
          <span className="flex min-w-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={brand.logoUrl}
              alt={brand.name}
              className={`h-9 w-auto max-w-[160px] object-contain ${clear ? "drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]" : ""}`}
            />
            <span className={`hidden text-[11px] sm:inline ${clear ? "text-white/80" : "text-muted"}`}>ค้นหารูปด้วย รูปเรา</span>
          </span>
        ) : (
        <Link href={inAdmin ? "/admin" : "/"} className={`flex shrink-0 items-center gap-2 whitespace-nowrap ${clear ? "rounded-full bg-white/85 px-2.5 py-1 backdrop-blur" : ""}`}>
          <Logo />
          {inAdmin && (
            // No room for the role badge on phones; the menu already shows what you can do.
            <span className="hidden rounded-full bg-soft px-2 py-0.5 text-[11px] font-medium text-muted sm:inline">
              {me?.role === "superadmin" ? "แอดมินใหญ่" : "ผู้จัดงาน"}
            </span>
          )}
        </Link>
        )}
        <nav className="flex min-w-0 items-center gap-0.5 whitespace-nowrap text-sm sm:gap-1">
          {inAdmin ? (
            <>
              <Link
                href="/admin"
                className={`rounded-full px-2.5 py-1.5 transition sm:px-3 ${pathname === "/admin" ? "bg-soft text-ink" : "text-muted hover:text-ink"}`}
              >
                อีเวนต์
              </Link>
              {me?.role === "superadmin" && (
                <>
                  {/* No room on phones; /admin links to it instead. */}
                  <Link
                    href="/admin/system"
                    className={`hidden rounded-full px-3 py-1.5 transition sm:inline ${pathname.startsWith("/admin/system") ? "bg-soft text-ink" : "text-muted hover:text-ink"}`}
                  >
                    ภาพรวม
                  </Link>
                  <Link
                    href="/admin/users"
                    className={`rounded-full px-2.5 py-1.5 transition sm:px-3 ${pathname.startsWith("/admin/users") ? "bg-soft text-ink" : "text-muted hover:text-ink"}`}
                  >
                    ผู้จัดงาน
                  </Link>
                </>
              )}
              <Link href="/guide#organizer" className="hidden rounded-full px-3 py-1.5 text-muted transition hover:text-ink sm:inline">
                คู่มือ
              </Link>
              {me && (
                <span className="hidden px-2 text-xs text-muted md:inline" title={me.username}>
                  {me.display_name || me.username}
                </span>
              )}
              <button
                onClick={() => {
                  session.clear();
                  location.href = "/admin/login";
                }}
                className="rounded-full px-2.5 py-1.5 text-muted transition hover:text-ink sm:px-3"
                aria-label="ออกจากระบบ"
              >
                <span className="sm:hidden">ออก</span>
                <span className="hidden sm:inline">ออกจากระบบ</span>
              </button>
            </>
          ) : (
            [
              { href: "/guide", label: "วิธีใช้" },
              { href: "/about", label: "เกี่ยวกับเรา", wide: true }, // no room on phones
              { href: "/privacy", label: "ความเป็นส่วนตัว" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-3 py-1.5 transition ${"wide" in l ? "hidden sm:inline" : ""} ${pathname === l.href ? "bg-soft text-ink" : linkIdle}`}
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

function useScrolled(enabled: boolean, threshold = 120) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const update = () => setScrolled(window.scrollY > threshold);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [enabled, threshold]);
  return scrolled;
}
