"use client";

import { useState } from "react";
import Modal from "./Modal";

export default function RemovalDialog({
  count,
  onSubmit,
  onClose,
}: {
  count: number;
  onSubmit: (contact: string, note: string) => Promise<void>;
  onClose: () => void;
}) {
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(contact.trim(), note.trim());
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งคำขอไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={done ? "ส่งคำขอแล้ว" : "ขอให้ลบรูปของฉัน"} onClose={onClose}>
      {done ? (
        <div className="text-sm text-muted">
          <p>ผู้จัดงานจะตรวจสอบและลบรูป {count} รูปที่คุณเลือก</p>
          <button onClick={onClose} className="mt-6 w-full rounded-full bg-ink py-2.5 text-sm font-medium text-white">
            ตกลง
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-muted">
            ส่งคำขอให้ผู้จัดงานลบรูปที่เลือก <span className="font-medium text-ink">{count} รูป</span> ออกจากระบบ
            (รวมข้อมูลใบหน้าในรูปเหล่านั้น) ระบบไม่เก็บรูปเซลฟี่ของคุณ
          </p>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="อีเมลหรือเบอร์โทรสำหรับติดต่อกลับ (ไม่บังคับ)"
            maxLength={255}
            className="w-full rounded-2xl bg-soft px-4 py-2.5 text-sm outline-none ring-ink/10 focus:bg-white focus:ring-2"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="หมายเหตุ (ไม่บังคับ)"
            maxLength={2000}
            rows={3}
            className="w-full resize-none rounded-2xl bg-soft px-4 py-2.5 text-sm outline-none ring-ink/10 focus:bg-white focus:ring-2"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            disabled={busy}
            className="w-full rounded-full bg-ink py-2.5 text-sm font-medium text-white transition hover:bg-ink/85 disabled:opacity-50"
          >
            {busy ? "กำลังส่ง…" : "ส่งคำขอลบ"}
          </button>
        </form>
      )}
    </Modal>
  );
}
