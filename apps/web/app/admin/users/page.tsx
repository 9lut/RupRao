"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/Confirm";
import Modal from "@/components/Modal";
import { useAdminMe } from "@/lib/adminMe";
import { adminApi, type AdminUser, type Role } from "@/lib/api";

const inputCls = "w-full rounded-2xl bg-soft px-4 py-2.5 text-sm outline-none ring-ink/10 transition focus:bg-white focus:ring-2";

const ROLE_LABEL: Record<Role, string> = { superadmin: "แอดมินใหญ่", organizer: "ผู้จัดอีเวนต์" };

function randomPassword() {
  // No look-alike characters, so it can be read out over the phone.
  const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "ยังไม่เคย";
}

/** Super admin: create and manage organizer accounts. */
export default function UsersPage() {
  const me = useAdminMe();
  const confirm = useConfirm();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetFor, setResetFor] = useState<AdminUser | null>(null);
  // Shown once after create / reset so the super admin can pass it on.
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);

  const load = useCallback(() => {
    adminApi
      .listUsers()
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"));
  }, []);
  useEffect(load, [load]);

  if (me && me.role !== "superadmin") {
    return <p className="mx-auto max-w-6xl px-4 pt-10 text-sm text-muted sm:px-6">หน้านี้สำหรับแอดมินใหญ่เท่านั้น</p>;
  }

  const update = async (u: AdminUser, body: Parameters<typeof adminApi.updateUser>[1]) => {
    try {
      await adminApi.updateUser(u.id, body);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  };

  const toggleActive = async (u: AdminUser) => {
    if (u.active) {
      const ok = await confirm({
        title: `ปิดบัญชี ${u.display_name || u.username}?`,
        message: "เข้าสู่ระบบไม่ได้ทันที (ที่เปิดค้างไว้จะถูกออกจากระบบ)",
        details: [`อีเวนต์ของบัญชีนี้ ${u.event_count} งานยังอยู่ครบ และผู้ร่วมงานยังค้นหารูปได้ตามปกติ`, "เปิดบัญชีกลับได้ทุกเมื่อ"],
        confirmLabel: "ปิดบัญชี",
        tone: "danger",
      });
      if (!ok) return;
    }
    update(u, { active: !u.active });
  };

  const changeRole = async (u: AdminUser, role: Role) => {
    if (role === u.role) return;
    const ok = await confirm({
      title: `เปลี่ยนเป็น${ROLE_LABEL[role]}?`,
      message: role === "superadmin" ? "จะเห็นและแก้ไขได้ทุกอีเวนต์ รวมถึงสร้าง/ปิดบัญชีผู้จัดงาน" : "จะเห็นเฉพาะอีเวนต์ของตัวเอง",
      confirmLabel: "เปลี่ยน",
      tone: role === "superadmin" ? "danger" : "default",
    });
    if (ok) update(u, { role });
  };

  const remove = async (u: AdminUser) => {
    const ok = await confirm({
      title: `ลบบัญชี ${u.display_name || u.username}?`,
      message: "ลบถาวร — ถ้าแค่ไม่ให้เข้าระบบ ใช้ “ปิดบัญชี” แทน",
      details: [`อีเวนต์ ${u.event_count} งานของบัญชีนี้จะไม่ถูกลบ แต่จะไม่มีเจ้าของ (แอดมินใหญ่ยังจัดการได้)`],
      confirmLabel: "ลบบัญชี",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await adminApi.deleteUser(u.id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ผู้จัดงาน</h1>
          <p className="mt-1 text-sm text-muted">สร้างบัญชีให้ผู้จัดแต่ละงาน — ผู้จัดเห็นและจัดการได้เฉพาะอีเวนต์ของตัวเอง</p>
        </div>
        <button onClick={() => setCreating(true)} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink/85">
          + สร้างบัญชีผู้จัดงาน
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}{" "}
          <button onClick={() => setError(null)} className="ml-2 underline">
            ปิด
          </button>
        </p>
      )}

      <div className="mt-6 overflow-hidden rounded-3xl border border-line">
        {!users ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="shimmer h-14 rounded-2xl" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">ยังไม่มีบัญชีผู้จัดงาน — กด “สร้างบัญชีผู้จัดงาน” เพื่อเริ่ม</div>
        ) : (
          <ul className="divide-y divide-line">
            {users.map((u) => (
              <li key={u.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 ${u.active ? "" : "bg-soft/60"}`}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-soft text-sm font-semibold uppercase">
                  {(u.display_name || u.username).slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {u.display_name || u.username}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${u.role === "superadmin" ? "bg-ink text-white" : "bg-soft text-muted"}`}>
                      {ROLE_LABEL[u.role]}
                    </span>
                    {!u.active && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-600">ปิดอยู่</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    <span className="font-mono">{u.username}</span> · {u.event_count} อีเวนต์ · เข้าระบบล่าสุด {fmt(u.last_login_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <select
                    value={u.role}
                    onChange={(e) => changeRole(u, e.target.value as Role)}
                    className="rounded-full border border-line bg-white px-3 py-1.5"
                    aria-label="บทบาท"
                  >
                    <option value="organizer">ผู้จัดอีเวนต์</option>
                    <option value="superadmin">แอดมินใหญ่</option>
                  </select>
                  <button onClick={() => setResetFor(u)} className="rounded-full border border-line px-3 py-1.5 hover:bg-soft">
                    รีเซ็ตรหัสผ่าน
                  </button>
                  <button onClick={() => toggleActive(u)} className="rounded-full border border-line px-3 py-1.5 hover:bg-soft">
                    {u.active ? "ปิดบัญชี" : "เปิดบัญชี"}
                  </button>
                  <button onClick={() => remove(u)} className="rounded-full px-3 py-1.5 text-muted hover:text-red-600">
                    ลบ
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && (
        <CreateUser
          onClose={() => setCreating(false)}
          onCreated={(username, password) => {
            setCreating(false);
            setCredentials({ username, password });
            load();
          }}
        />
      )}
      {resetFor && (
        <ResetPassword
          user={resetFor}
          onClose={() => setResetFor(null)}
          onDone={(password) => {
            setCredentials({ username: resetFor.username, password });
            setResetFor(null);
          }}
        />
      )}
      {credentials && <CredentialsCard {...credentials} onClose={() => setCredentials(null)} />}
    </div>
  );
}

function CreateUser({ onClose, onCreated }: { onClose: () => void; onCreated: (username: string, password: string) => void }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState(randomPassword);
  const [role, setRole] = useState<Role>("organizer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminApi.createUser({ username: username.trim(), password, display_name: displayName.trim() || null, role });
      onCreated(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างไม่สำเร็จ");
      setBusy(false);
    }
  };

  return (
    <Modal title="สร้างบัญชีผู้จัดงาน" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">ชื่อที่แสดง</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="เช่น ค่าย GF7 / คุณเอ" className={`mt-2 ${inputCls}`} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">ชื่อผู้ใช้ (ใช้เข้าสู่ระบบ)</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/[^A-Za-z0-9._-]/g, ""))}
            required
            minLength={3}
            maxLength={64}
            autoCapitalize="none"
            placeholder="gf7-team"
            className={`mt-2 font-mono ${inputCls}`}
          />
          <span className="mt-1 block text-xs text-muted">ภาษาอังกฤษ ตัวเลข . _ - อย่างน้อย 3 ตัว</span>
        </label>
        <label className="block">
          <span className="text-sm font-medium">รหัสผ่านเริ่มต้น</span>
          <div className="mt-2 flex gap-2">
            <input value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className={`font-mono ${inputCls}`} />
            <button type="button" onClick={() => setPassword(randomPassword())} className="shrink-0 rounded-full border border-line px-3 text-xs hover:bg-soft">
              สุ่มใหม่
            </button>
          </div>
          <span className="mt-1 block text-xs text-muted">อย่างน้อย 8 ตัว · จะแสดงให้คัดลอกอีกครั้งหลังสร้าง</span>
        </label>
        <div>
          <span className="text-sm font-medium">บทบาท</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["organizer", "superadmin"] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`rounded-2xl border p-3 text-left text-xs transition ${role === r ? "border-ink ring-2 ring-ink/10" : "border-line hover:border-ink/25"}`}
              >
                <span className="block text-sm font-medium">{ROLE_LABEL[r]}</span>
                <span className="text-muted">{r === "organizer" ? "จัดการเฉพาะอีเวนต์ของตัวเอง" : "ทุกอีเวนต์ + จัดการบัญชี"}</span>
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={busy || username.trim().length < 3 || password.length < 8} className="w-full rounded-full bg-ink py-2.5 text-sm font-medium text-white disabled:opacity-40">
          {busy ? "กำลังสร้าง…" : "สร้างบัญชี"}
        </button>
      </form>
    </Modal>
  );
}

function ResetPassword({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: (password: string) => void }) {
  const [password, setPassword] = useState(randomPassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={`รีเซ็ตรหัสผ่าน ${user.display_name || user.username}`} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await adminApi.updateUser(user.id, { password });
            onDone(password);
          } catch (err) {
            setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
            setBusy(false);
          }
        }}
        className="space-y-4"
      >
        <div className="flex gap-2">
          <input value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required className={`font-mono ${inputCls}`} />
          <button type="button" onClick={() => setPassword(randomPassword())} className="shrink-0 rounded-full border border-line px-3 text-xs hover:bg-soft">
            สุ่มใหม่
          </button>
        </div>
        <p className="text-xs text-muted">รหัสเดิมจะใช้ไม่ได้ทันที</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={busy || password.length < 8} className="w-full rounded-full bg-ink py-2.5 text-sm font-medium text-white disabled:opacity-40">
          {busy ? "กำลังบันทึก…" : "ตั้งรหัสใหม่"}
        </button>
      </form>
    </Modal>
  );
}

function CredentialsCard({ username, password, onClose }: { username: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `เข้าระบบผู้จัดงาน: ${typeof window !== "undefined" ? location.origin : ""}/admin/login\nชื่อผู้ใช้: ${username}\nรหัสผ่าน: ${password}`;
  return (
    <Modal title="ส่งข้อมูลนี้ให้ผู้จัดงาน" onClose={onClose}>
      <pre className="whitespace-pre-wrap rounded-2xl bg-soft p-4 font-mono text-xs leading-relaxed">{text}</pre>
      <p className="mt-3 text-xs text-muted">รหัสผ่านจะไม่แสดงอีก — ถ้าลืม ใช้ “รีเซ็ตรหัสผ่าน”</p>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {}
        }}
        className="mt-4 w-full rounded-full bg-ink py-2.5 text-sm font-medium text-white"
      >
        {copied ? "คัดลอกแล้ว ✓" : "คัดลอกทั้งหมด"}
      </button>
    </Modal>
  );
}
