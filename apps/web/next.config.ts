import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Photos are served via presigned URLs from S3-compatible storage; keep <img> unoptimized.
  images: { unoptimized: true },
  async redirects() {
    return [{ source: "/events/:path*", destination: "/admin", permanent: false }];
  },
};

export default nextConfig;
