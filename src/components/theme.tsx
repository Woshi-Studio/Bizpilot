"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore, useTransition } from "react";
import Icon from "./icons";
import { THEME_KEY } from "@/lib/theme-script";
import { THEMES, themeAllowed, type Plan, type ThemeId } from "@/lib/plans";
import { saveTheme } from "@/app/(app)/profile-actions";

// Four themes: clean, dark, neon, retro — or "system" (clean or dark,
// following the device). The choice is saved in this browser
// (localStorage "jephelen-theme") AND on the profile (profiles.theme),
// so it follows the user to other devices.
export type ThemeChoice = ThemeId | "system";
const EVENT = "jephelen-theme-change";

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light") return "clean";
    return v === "clean" || v === "dark" || v === "neon" || v === "retro" ? v : "system";
  } catch {
    return "system";
  }
}

function systemDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function paint(choice: ThemeChoice) {
  const theme: ThemeId = choice === "system" ? (systemDark() ? "dark" : "clean") : choice;
  const html = document.documentElement;
  html.classList.toggle("dark", theme !== "clean");
  html.setAttribute("data-theme", theme);
}

// Switches the page now and remembers it in this browser.
export function applyTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // storage blocked: still switch for this visit
  }
  paint(choice);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (readChoice() === "system") paint("system");
    cb();
  };
  window.addEventListener(EVENT, cb);
  mq.addEventListener("change", onSystem);
  return () => {
    window.removeEventListener(EVENT, cb);
    mq.removeEventListener("change", onSystem);
  };
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, readChoice, () => "system");
}

// Applies the profile's theme when the app loads (other device, or a
// downgrade took a paid theme away). serverTheme: the effective saved
// theme, or null when nothing is saved. paidOk: may use Neon / Retro.
export function ThemeSync({
  serverTheme,
  paidOk,
}: {
  serverTheme: ThemeId | null;
  paidOk: boolean;
}) {
  useEffect(() => {
    const local = readChoice();
    // If React ever rebuilds the page from scratch (e.g. after a hydration
    // error) the <html> attributes set by the head script are lost; put
    // them back.
    paint(local);
    if (serverTheme && serverTheme !== local) {
      applyTheme(serverTheme);
    } else if (!paidOk && (local === "neon" || local === "retro")) {
      applyTheme("clean");
    }
  }, [serverTheme, paidOk]);
  return null;
}

// Mini preview colors for each tile (a picture of the theme, not the
// theme itself, so all four show side by side).
const PREVIEW: Record<ThemeId, { bg: string; side: string; card: string; line: string; accent: string; accent2: string; edge?: string; font?: string }> = {
  clean: { bg: "#f5f6fa", side: "#ffffff", card: "#ffffff", line: "#e3e6ee", accent: "#4f46e5", accent2: "#a5b4fc" },
  dark: { bg: "#0b0d13", side: "#141720", card: "#191c27", line: "#2a2f3d", accent: "#6366f1", accent2: "#818cf8" },
  neon: { bg: "#0b0420", side: "#140a2c", card: "#1a0e38", line: "#3b2268", accent: "#ff2d9f", accent2: "#19e6ff", edge: "0 0 10px rgba(255,45,160,.7)", font: "var(--font-orbitron)" },
  retro: { bg: "#14110d", side: "#1c1813", card: "#221d17", line: "#4b4133", accent: "#39ff7a", accent2: "#ffb000", font: "var(--font-vt323)" },
};

function Preview({ id }: { id: ThemeId }) {
  const p = PREVIEW[id];
  const square = id === "retro";
  return (
    <div
      aria-hidden
      className="relative flex h-24 overflow-hidden"
      style={{ background: p.bg, borderRadius: square ? 2 : 10 }}
    >
      <div
        className="w-7 shrink-0"
        style={{ background: p.side, boxShadow: p.edge ? `1px 0 0 ${p.accent}, ${p.edge}` : `1px 0 0 ${p.line}` }}
      >
        <div className="mx-auto mt-2 h-3 w-3" style={{ background: p.accent, borderRadius: square ? 1 : 4 }} />
        <div className="mx-auto mt-2 h-1 w-4 rounded" style={{ background: p.line }} />
        <div className="mx-auto mt-1 h-1 w-4 rounded" style={{ background: p.line }} />
      </div>
      <div className="flex-1 p-2">
        <p
          className="truncate text-[11px] font-bold leading-4"
          style={{ color: id === "clean" ? "#0f172a" : id === "retro" ? p.accent : "#f5f5ff", fontFamily: p.font, fontSize: id === "retro" ? 15 : undefined }}
        >
          Today
        </p>
        <div
          className="mt-1.5 h-9 p-1.5"
          style={{
            background: p.card,
            borderRadius: square ? 1 : 6,
            border: `1px solid ${p.line}`,
            boxShadow: id === "neon" ? "0 0 10px -2px rgba(255,45,160,.6)" : square ? "2px 2px 0 #000" : undefined,
          }}
        >
          <div className="h-1 w-3/4 rounded" style={{ background: p.line }} />
          <div className="mt-1 flex gap-1">
            <span className="h-2.5 w-7" style={{ background: p.accent, borderRadius: square ? 0 : 3, boxShadow: square ? "1px 1px 0 #000" : undefined }} />
            <span className="h-2.5 w-4" style={{ background: p.accent2, borderRadius: square ? 0 : 3, opacity: 0.8 }} />
          </div>
        </div>
      </div>
      {id === "retro" && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "repeating-linear-gradient(to bottom, transparent 0, transparent 2px, rgba(0,0,0,.25) 3px)" }}
        />
      )}
    </div>
  );
}

// Settings > Theme: four preview tiles. Starter can pick Clean and Dark;
// Neon and Retro show a Hustle lock with an upgrade link.
export function ThemePicker({ plan, unlimited }: { plan: Plan; unlimited: boolean }) {
  const choice = useThemeChoice();
  const [, startTransition] = useTransition();
  const current: ThemeId | "system" = choice;

  function pick(id: ThemeId | "system") {
    applyTheme(id);
    startTransition(async () => {
      await saveTheme(id === "system" ? null : id);
    });
  }

  return (
    <div>
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {THEMES.map((t) => {
          const allowed = themeAllowed(t.id, plan, unlimited);
          const active = current === t.id;
          const tile = (
            <>
              <Preview id={t.id} />
              <span className="mt-2 flex flex-wrap items-center justify-between gap-1 px-0.5">
                <span className="text-sm font-semibold text-ink">{t.label}</span>
                {!allowed ? (
                  <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                    🔒 Hustle
                  </span>
                ) : active ? (
                  <Icon name="check" className="h-4 w-4 text-accent" />
                ) : null}
              </span>
              <span className="block px-0.5 text-xs text-muted">{t.blurb}</span>
            </>
          );
          const cls = `block rounded-2xl border-2 p-2 text-left transition-all ${
            active
              ? "border-accent shadow-card"
              : "border-transparent bg-surface-2 hover:border-line"
          }`;
          return allowed ? (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => pick(t.id)}
              className={cls}
            >
              {tile}
            </button>
          ) : (
            <Link
              key={t.id}
              href="#plan"
              className={`${cls} opacity-80 hover:opacity-100`}
              title={`${t.label} comes with Hustle — see plans below`}
            >
              {tile}
            </Link>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted">
        {current === "system" ? (
          "Following your device (Clean by day, Dark at night). Pick one to keep it."
        ) : (
          <button type="button" onClick={() => pick("system")} className="link text-xs">
            Follow my device instead
          </button>
        )}
      </p>
    </div>
  );
}

// Small icon button (top bar): flips Clean <-> Dark. From Neon or Retro
// it goes to Clean.
export function ThemeToggleButton() {
  useThemeChoice();
  return (
    <button
      type="button"
      onClick={() => {
        const isClean = document.documentElement.getAttribute("data-theme") === "clean";
        const next: ThemeId = isClean ? "dark" : "clean";
        applyTheme(next);
        void saveTheme(next);
      }}
      aria-label="Switch light or dark"
      title="Light / dark"
      className="rounded-xl p-2 text-muted transition-colors hover:bg-surface-3 hover:text-ink"
    >
      <Icon name="moon" className="h-5 w-5 dark:hidden" />
      <Icon name="sun" className="hidden h-5 w-5 dark:block" />
    </button>
  );
}
