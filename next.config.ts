import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Receipt photo uploads go through server actions
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
