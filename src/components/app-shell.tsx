"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import FeedbackWidget from "./feedback-widget";
import Icon from "./icons";
import { ThemeToggleButton } from "./theme";
import { NAV_GROUPS, groupFor, pageFor } from "@/lib/nav";

function initials(name: string) {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-sm">
        J
      </span>
      <span className="text-[17px] font-semibold tracking-tight text-ink">
        Jephelen
      </span>
    </Link>
  );
}

export default function AppShell({
  businessName,
  userName,
  signOutAction,
  athena,
  children,
}: {
  businessName: string;
  userName: string;
  signOutAction: () => Promise<void>;
  athena?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const group = groupFor(pathname);
  const page = pageFor(pathname);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-canvas">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line/70 bg-surface px-4 py-6 print:hidden lg:flex">
        <div className="px-2">
          <Logo />
        </div>

        <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
          {NAV_GROUPS.map((g) => {
            const active = group?.key === g.key;
            return (
              <Link
                key={g.key}
                href={g.href}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors ${
                  active
                    ? "bg-accent-soft text-accent-text"
                    : "text-ink-2 hover:bg-surface-3 hover:text-ink"
                }`}
              >
                <Icon
                  name={g.icon}
                  className={`h-5 w-5 ${active ? "text-accent" : "text-subtle group-hover:text-ink-2"}`}
                />
                {g.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-2xl bg-surface-2 p-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-text">
              {initials(userName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{userName}</p>
              <p className="truncate text-xs text-muted">{businessName}</p>
            </div>
          </div>
          <form action={signOutAction} className="mt-3">
            <button type="submit" className="btn-ghost btn-sm w-full justify-start">
              <Icon name="logout" className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-line/60 bg-canvas/80 backdrop-blur-md print:hidden">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
            <div className="flex min-w-0 items-center gap-3">
              <div className="lg:hidden">
                <Logo />
              </div>
              <div className="hidden min-w-0 items-center gap-2 text-sm lg:flex">
                <span className="truncate font-medium text-muted">{businessName}</span>
                {group && (
                  <>
                    <Icon name="chevronRight" className="h-4 w-4 text-subtle" />
                    <span className="font-semibold text-ink">{group.label}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <FeedbackWidget />
              <ThemeToggleButton />
              <div className="relative lg:hidden">
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-label="Account menu"
                  aria-expanded={menuOpen}
                  className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-text"
                >
                  {initials(userName)}
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div className="card absolute right-0 top-11 z-50 w-60 p-3 shadow-pop">
                      <p className="truncate text-sm font-semibold text-ink">{userName}</p>
                      <p className="truncate text-xs text-muted">{businessName}</p>
                      <Link
                        href="/settings"
                        onClick={() => setMenuOpen(false)}
                        className="btn-ghost btn-sm mt-3 w-full justify-start"
                      >
                        <Icon name="settings" className="h-4 w-4" />
                        Settings
                      </Link>
                      <form action={signOutAction}>
                        <button type="submit" className="btn-ghost btn-sm w-full justify-start">
                          <Icon name="logout" className="h-4 w-4" />
                          Sign out
                        </button>
                      </form>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 pb-32 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-8 print:p-0">
          {/* Page tabs inside a group (e.g. People: Customers · Leads) */}
          {group && group.pages.length > 1 && (
            <div className="mx-auto mb-7 max-w-6xl print:hidden">
              <nav
                aria-label={`${group.label} pages`}
                className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]"
              >
                {group.pages.map((p) => {
                  const active = page?.href === p.href;
                  return (
                    <Link
                      key={p.href}
                      href={p.href}
                      aria-current={active ? "page" : undefined}
                      className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? "bg-ink text-canvas shadow-sm"
                          : "text-muted hover:bg-surface-3 hover:text-ink"
                      }`}
                    >
                      {p.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md print:hidden lg:hidden"
      >
        <div className="grid grid-cols-6">
          {NAV_GROUPS.map((g) => {
            const active = group?.key === g.key;
            return (
              <Link
                key={g.key}
                href={g.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <span
                  className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                    active ? "bg-accent-soft" : ""
                  }`}
                >
                  <Icon name={g.icon} className="h-[22px] w-[22px]" />
                </span>
                {g.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {athena}
    </div>
  );
}
