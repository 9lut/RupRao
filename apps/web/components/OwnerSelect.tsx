"use client";

import { useEffect, useState } from "react";
import { useAdminMe } from "@/lib/adminMe";
import { adminApi, type AdminUser } from "@/lib/api";

/** Super admin only: which organizer account owns the event. Renders nothing for organizers. */
export default function OwnerSelect({
  value,
  onChange,
  className = "",
}: {
  value: string | null;
  onChange: (ownerId: string | null) => void;
  className?: string;
}) {
  const me = useAdminMe();
  const isSuper = me?.role === "superadmin";
  const [users, setUsers] = useState<AdminUser[]>([]);

  useEffect(() => {
    if (!isSuper) return;
    adminApi
      .listUsers()
      .then((list) => setUsers(list.filter((u) => u.active || u.id === value)))
      .catch(() => setUsers([]));
  }, [isSuper, value]);

  if (!isSuper) return null;
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-medium">เจ้าของอีเวนต์</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="mt-2 w-full rounded-2xl bg-soft px-4 py-2.5 text-sm outline-none ring-ink/10 focus:bg-white focus:ring-2"
      >
        <option value="">แอดมินใหญ่ (ไม่มีผู้จัด)</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.display_name || u.username} ({u.username})
          </option>
        ))}
      </select>
      <span className="mt-1.5 block text-xs text-muted">ผู้จัดที่เลือกจะเห็นและจัดการอีเวนต์นี้ได้จากบัญชีของตัวเอง</span>
    </label>
  );
}
