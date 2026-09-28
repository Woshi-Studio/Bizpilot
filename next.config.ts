import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The 6 nav groups have short names too. Every old URL keeps working.
  async redirects() {
    return [
      { source: "/home", destination: "/dashboard", permanent: false },
      { source: "/people", destination: "/customers", permanent: false },
      { source: "/work", destination: "/tasks", permanent: false },
      { source: "/ai", destination: "/messages", permanent: false },
      // The Lead Finder's tab was "Found"; it is "Search leads" now.
      { source: "/leads/found", destination: "/leads/search", permanent: false },
      { source: "/leads/found/:path*", destination: "/leads/search/:path*", permanent: false },
    ];
  },
  experimental: {
    serverActions: {
      // Receipt uploads (max 10MB, see money/actions.ts) go through server actions
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
