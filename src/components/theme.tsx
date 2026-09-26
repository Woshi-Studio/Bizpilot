"use client";

import { useSyncExternalStore } from "react";
import Icon from "./icons";
import { THEME_KEY } from "@/lib/theme-script";

// Light / dark / system. The choice is saved in this browser
// (localStorage "jephelen-theme"). "system" follows the OS setting.
export type ThemeChoice = "system" | "light" | "dark";
const KEY = THEME_KEY;
const EVENT = "jephelen-theme-change";

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // storage blocked: still switch for this visit
  }
  const dark =
    choice === "dark" ||
    (choice === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (readChoice() === "system") {
      document.documentElement.classList.toggle("dark", mq.matches);
    }
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

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

// Segmented control for Settings > Appearance.
export function ThemePicker() {
  const choice = useThemeChoice();
  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="inline-flex rounded-xl bg-surface-3 p-1"
    >
      {OPTIONS.map((o) => {
        const active = choice === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => applyTheme(o.value)}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all ${
              active
                ? "bg-surface text-ink shadow-card"
                : "text-muted hover:text-ink"
            }`}
          >
            {o.value === "light" && <Icon name="sun" className="h-4 w-4" />}
            {o.value === "dark" && <Icon name="moon" className="h-4 w-4" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Small icon button (top bar): flips light <-> dark.
export function ThemeToggleButton() {
  useThemeChoice();
  return (
    <button
      type="button"
      onClick={() => {
        const isDark = document.documentElement.classList.contains("dark");
        applyTheme(isDark ? "light" : "dark");
      }}
      aria-label="Switch light or dark mode"
      title="Light / dark"
      className="rounded-xl p-2 text-muted transition-colors hover:bg-surface-3 hover:text-ink"
    >
      <Icon name="moon" className="h-5 w-5 dark:hidden" />
      <Icon name="sun" className="hidden h-5 w-5 dark:block" />
    </button>
  );
}
