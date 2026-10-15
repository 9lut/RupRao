import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Thai } from "next/font/google";
import { NavTracker } from "@/components/BackButton";
import { ConfirmProvider } from "@/components/Confirm";
import Header from "@/components/Header";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const thai = Noto_Sans_Thai({ subsets: ["thai"], weight: ["300", "400", "500", "600"], variable: "--font-thai" });

export const metadata: Metadata = {
  title: "รูปเรา (RupRao)",
  description: "ค้นหารูปของคุณจากใบหน้า",
  applicationName: "รูปเรา RupRao",
  authors: [{ name: "Lutfee" }],
  creator: "Lutfee",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${inter.variable} ${thai.variable}`}>
      <body className="min-h-screen font-sans">
        <ConfirmProvider>
          <NavTracker />
          <Header />
          <main>{children}</main>
        </ConfirmProvider>
      </body>
    </html>
  );
}
