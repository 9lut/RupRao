"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StorageBar, UsageText, usageTone } from "@/components/StorageBar";
import { useAdminMe } from "@/lib/adminMe";
import { adminApi, type DiskUsage, type SystemOverview } from "@/lib/api";
import { fmtBytes } from "@/lib/bytes";

/** Super admin: the whole system at a glance. Organizers only ever see their own numbers on /admin. */
export default function SystemPage() {
  const me = useAdminMe();
  const isSuper = me?.role === "superadmin";
  const [data, setData] = useState<SystemOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuper) return;
    const load = () =>
      adminApi
        .system()
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"));
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [isSuper]);

  if (me && !isSuper) {
    return <p className="mx-auto max-w-6xl px-4 pt-10 text-sm text-muted sm:px-6">หน้านี้สำหรับแอดมินใหญ่เท่านั้น</p>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">ภาพรวมระบบ</h1>
      <p className="mt-1 text-sm text-muted">ทุกอีเวนต์และทุกบัญชี เห็นได้เฉพาะแอดมินใหญ่ ผู้จัดงานเห็นเฉพาะตัวเลขของตัวเอง</p>

      {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {!data ? (
        <div className="mt-6 space-y-3">
          <div className="shimmer h-32 rounded-3xl" />
          <div className="shimmer h-20 rounded-2xl" />
        </div>
      ) : (
        <>
          <DiskCard disk={data.disk} photosBytes={data.photos_bytes} minFree={data.min_free_bytes} />

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="อีเวนต์" value={data.events} />
            <Stat label="รูปทั้งหมด" value={data.photos} />
            <Stat label="ใบหน้า" value={data.faces} />
            <Stat label="บัญชีผู้จัด" value={data.accounts} />
            <Stat
              label="คิวสแกน"
              value={data.queue?.queued}
              hint={data.queue ? `กำลังทำ ${data.queue.running} · ล้มเหลว ${data.queue.failed}` : "คิวไม่พร้อม"}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="คนเข้าดู" value={data.visitors} hint="นับแยกต่ออีเวนต์" />
            <Stat label="คนสแกนหน้า" value={data.scan_people} hint={`รวม ${data.scans.toLocaleString()} ครั้ง`} />
            <Stat label="คนดาวน์โหลด" value={data.download_people} hint={`รวม ${data.downloads.toLocaleString()} รูป`} />
          </div>

          <div className="mt-10 flex items-end justify-between gap-4">
            <h2 className="text-lg font-semibold">ผู้จัดงาน</h2>
            <Link href="/admin/users" className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline">
              จำกัดพื้นที่ / จัดการบัญชี →
            </Link>
          </div>
          <Rows
            empty="ยังไม่มีบัญชีผู้จัดงาน"
            rows={data.owners.map((o) => ({
              key: o.id ?? "none",
              title: o.name,
              sub: `${o.events} อีเวนต์ · ${o.photos.toLocaleString()} รูป`,
              used: o.bytes,
              limit: o.quota_bytes,
              people: o,
            }))}
          />

          <h2 className="mt-10 text-lg font-semibold">อัลบั้มที่ใช้พื้นที่มากสุด</h2>
          <Rows
            empty="ยังไม่มีอีเวนต์"
            rows={data.top_events.map((e) => ({
              key: e.id,
              title: e.name,
              href: `/admin/events/${e.id}`,
              sub: `${e.photos.toLocaleString()} รูป`,
              used: e.bytes,
              limit: e.quota_bytes,
              people: e,
            }))}
          />
        </>
      )}
    </div>
  );
}

function DiskCard({ disk, photosBytes, minFree }: { disk: DiskUsage | null; photosBytes: number; minFree: number }) {
  if (!disk) {
    return (
      <div className="mt-6 rounded-3xl border border-line p-5">
        <p className="text-sm font-medium">พื้นที่เก็บรูป</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtBytes(photosBytes)}</p>
        <p className="mt-1 text-xs text-muted">รูปอยู่ในที่เก็บภายนอก จึงไม่ทราบความจุทั้งหมด ดูยอดจริงได้ที่ผู้ให้บริการ</p>
      </div>
    );
  }
  const tone = usageTone(disk.used, disk.total);
  const blocked = disk.free < minFree;
  return (
    <div className={`mt-6 rounded-3xl border p-5 ${tone === "danger" ? "border-red-200 bg-red-50/40" : tone === "warn" ? "border-amber-200 bg-amber-50/40" : "border-line"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium">พื้นที่เซิร์ฟเวอร์</p>
        <p className="text-sm text-muted">
          เหลือ <span className="font-medium text-ink">{fmtBytes(disk.free)}</span>
        </p>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        <UsageText used={disk.used} limit={disk.total} />
        <span className="ml-2 text-sm font-normal text-muted">{Math.round((disk.used / disk.total) * 100)}%</span>
      </p>
      <StorageBar used={disk.used} limit={disk.total} className="mt-3" />
      <p className="mt-2 text-xs text-muted">รูปภาพ {fmtBytes(photosBytes)} · ส่วนที่เหลือคือฐานข้อมูล ระบบ และไฟล์สำรอง</p>
      {blocked ? (
        <p className="mt-3 text-sm font-medium text-red-600">พื้นที่เหลือน้อยกว่า {fmtBytes(minFree)} ระบบหยุดรับรูปใหม่แล้ว ต้องขยายดิสก์หรือลบอีเวนต์เก่า</p>
      ) : tone !== "ok" ? (
        <p className={`mt-3 text-sm font-medium ${tone === "danger" ? "text-red-600" : "text-amber-700"}`}>
          ใกล้เต็มแล้ว ควรขยายดิสก์หรือลบอีเวนต์เก่า ระบบจะหยุดรับรูปใหม่เมื่อเหลือน้อยกว่า {fmtBytes(minFree)}
        </p>
      ) : null}
    </div>
  );
}

interface Row {
  key: string;
  title: string;
  href?: string;
  sub: string;
  used: number;
  limit: number | null;
  people: { visitors: number; scan_people: number; download_people: number };
}

function Rows({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) return <p className="mt-3 rounded-3xl border border-line p-8 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="mt-3 divide-y divide-line overflow-hidden rounded-3xl border border-line">
      {rows.map((r) => (
        <li key={r.key} className="grid gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_200px_180px] sm:items-center">
          <div className="min-w-0">
            {r.href ? (
              <Link href={r.href} className="block truncate text-sm font-medium hover:underline">
                {r.title}
              </Link>
            ) : (
              <p className="truncate text-sm font-medium">{r.title}</p>
            )}
            <p className="mt-0.5 text-xs text-muted">{r.sub}</p>
          </div>
          <div className="text-xs tabular-nums">
            <UsageText used={r.used} limit={r.limit} />
            {r.limit === null && <span className="text-muted"> (ไม่จำกัด)</span>}
            <StorageBar used={r.used} limit={r.limit} className="mt-1.5" />
          </div>
          <p className="text-xs tabular-nums text-muted sm:text-right">
            เข้าดู {r.people.visitors.toLocaleString()} · สแกน {r.people.scan_people.toLocaleString()} · โหลด {r.people.download_people.toLocaleString()} คน
          </p>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value, hint }: { label: string; value?: number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value === undefined ? "–" : value.toLocaleString()}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
