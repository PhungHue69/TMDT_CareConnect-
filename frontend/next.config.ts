import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the floating dev badge sat on top of the mobile bottom nav
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1", "10.11.152.107", "192.168.1.121", "192.168.1.123", "192.168.1.131"],
  async rewrites() {
    return [
      { source: "/demo-api/:path*", destination: "http://127.0.0.1:8000/:path*" },
      { source: "/static/:path*", destination: "http://127.0.0.1:8000/static/:path*" },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
