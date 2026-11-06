import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/samples/:path*.xlsx",
        headers: [
          { key: "Content-Type", value: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
          { key: "Content-Disposition", value: "attachment" },
        ],
      },
      {
        source: "/brand/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
