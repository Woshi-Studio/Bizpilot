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
      // Settings holds only true settings now; the rest moved where it's used.
      { source: "/settings/booking", destination: "/calendar/booking-page", permanent: false },
      { source: "/settings/booking/:path*", destination: "/calendar/booking-page/:path*", permanent: false },
      { source: "/settings/plan", destination: "/plans", permanent: false },
      { source: "/settings/payments", destination: "/money/payments", permanent: false },
      { source: "/settings/templates", destination: "/messages/templates", permanent: false },
      { source: "/settings/public-page", destination: "/leads/public-page", permanent: false },
      { source: "/templates", destination: "/messages/templates", permanent: false },
      { source: "/payments", destination: "/money/payments", permanent: false },
      { source: "/booking-page", destination: "/calendar/booking-page", permanent: false },
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
