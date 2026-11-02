"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BRAND_ASSETS } from "@/components/brand";
import { adminApi } from "@/lib/api";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminApi.login(username, password);
      const next = params.get("next");
      // Only allow same-site admin paths as redirect targets.
      location.href = next && next.startsWith("/admin") ? next : "/admin";
    } catch (err) {
      setError(err instanceof Error ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
      setBusy(false);
    }
  };

  const input =
    "w-full rounded-full border border-line bg-white px-5 py-3 text-sm outline-none transition focus:border-ink";

  return (
    <div className="mx-auto max-w-sm px-4 pb-24 pt-20">
      <div className="rounded-[32px] border border-line bg-gradient-to-b from-white to-soft px-6 py-10 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND_ASSETS.logo} alt="รูปเรา RupRao" className="mx-auto h-28 w-auto" />
        <h1 className="mt-5 text-lg font-semibold">สำหรับผู้จัดงาน</h1>
        <p className="mt-1 text-sm text-muted">เข้าสู่ระบบเพื่อจัดการอีเวนต์และรูปภาพ</p>
        <form onSubmit={submit} className="mt-7 space-y-3 text-left">
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="ชื่อผู้ใช้" className={input} />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="รหัสผ่าน"
            className={input}
          />
          {error && <p className="px-2 text-sm text-red-600">{error}</p>}
          <button disabled={busy || !password} className="w-full rounded-full bg-ink py-3 text-sm font-medium text-white disabled:opacity-40">
            {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
          </button>
        </form>
      </div>
    </div>
  );
}
