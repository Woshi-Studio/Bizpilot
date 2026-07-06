"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import FeedbackWidget from "./feedback-widget";

type NavItem = {
  label: string;
  href: string;
  soon?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Customers", href: "/customers" },
  { label: "Tasks", href: "/tasks" },
  { label: "AI Messages", href: "/messages" },
  { label: "Decision Guard", href: "/decisions" },
  { label: "Money", href: "/money" },
  { label: "Invoices", href: "/invoices" },
  { label: "Settings", href: "/settings" },
];

export default function AppShell({
  businessName,
  userName,
  signOutAction,
  children,
}: {
  businessName: string;
  userName: string;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-1 px-3">
      {NAV_ITEMS.map((item) =>
        item.soon ? (
          <span
            key={item.href}
            className="flex cursor-default items-center justify-between rounded-md px-3 py-2 text-sm text-slate-400"
          >
            {item.label}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Soon
            </span>
          </span>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setSidebarOpen(false)}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              pathname.startsWith(item.href)
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {item.label}
          </Link>
        )
      )}
    </nav>
  );

  return (
    <div className="flex min-h-screen w-full">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white py-5 print:hidden lg:flex">
        <div className="mb-6 px-6">
          <Link href="/dashboard" className="text-xl font-bold text-indigo-600">
            BizPilot
          </Link>
        </div>
        {nav}
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-60 flex-col bg-white py-5 shadow-xl">
            <div className="mb-6 flex items-center justify-between px-6">
              <span className="text-xl font-bold text-indigo-600">
                BizPilot
              </span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close menu"
                className="text-2xl leading-none text-slate-400 hover:text-slate-600"
              >
                &times;
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 print:hidden sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <span className="truncate text-sm font-semibold text-slate-800">
              {businessName}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-500 sm:inline">
              {userName}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>

      <FeedbackWidget />
    </div>
  );
}
