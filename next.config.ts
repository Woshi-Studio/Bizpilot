import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Receipt uploads (max 10MB, see money/actions.ts) go through server actions
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
