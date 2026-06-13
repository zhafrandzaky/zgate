import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  serverExternalPackages: ["argon2", "@prisma/client", "ioredis"],
  async rewrites() {
    return [
      { source: "/v1/:path*", destination: "/api/v1/:path*" },
      { source: "/v1beta/:path*", destination: "/api/v1beta/:path*" },
    ];
  },
};

export default nextConfig;
