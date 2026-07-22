import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This project has its own lockfile; pin the workspace root to silence
  // Next's multi-lockfile inference warning.
  turbopack: { root: __dirname },
};

export default nextConfig;
