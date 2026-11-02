"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { setAdminMe } from "@/lib/adminMe";
import { adminApi, session } from "@/lib/api";

/** Client-side guard; the API enforces auth on every admin request regardless. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname.startsWith("/admin/login");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (isLogin) return;
    if (!session.get()) {
      location.href = `/admin/login?next=${encodeURIComponent(pathname)}`;
      return;
    }
    adminApi
      .me()
      .then((me) => {
        setAdminMe(me);
        setOk(true);
      })
      .catch(() => {}); // 401 → api client redirects to login
  }, [isLogin, pathname]);

  if (isLogin) return <>{children}</>;
  if (!ok) {
    return (
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <div className="shimmer h-8 w-48 rounded-full" />
      </div>
    );
  }
  return <>{children}</>;
}
