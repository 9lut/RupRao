import type { MetadataRoute } from "next";

// "Add to Home Screen" on phones: opens full-screen with the RupRao icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "รูปเรา (RupRao)",
    short_name: "รูปเรา",
    description: "ค้นหารูปของคุณจากใบหน้า",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#FFFFFF",
    icons: [
      { src: "/brand/icon-192.png", type: "image/png", sizes: "192x192" },
      { src: "/brand/icon-512.png", type: "image/png", sizes: "512x512" },
      { src: "/brand/icon-maskable-512.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ],
  };
}
