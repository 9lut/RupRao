import type { Metadata } from "next";
import NotFoundView from "@/components/NotFoundView";

export const metadata: Metadata = { title: "ไม่พบหน้านี้ · รูปเรา (RupRao)" };

export default function NotFound() {
  return <NotFoundView />;
}
