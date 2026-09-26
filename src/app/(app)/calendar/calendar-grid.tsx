"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { lineLabel } from "@/lib/business-lines";

export type CalendarItem = {
  key: string;
  kind: "task" | "lead" | "customer" | "invoice" | "meeting";
  title: string;
  // all-day items carry a date ("YYYY-MM-DD"); meetings carry a timestamp
  date?: string | null;
  at?: string | null;
  href: string | null;
  done?: boolean;
  line?: string | null;
};

const KIND_STYLE: Record<CalendarItem["kind"], { icon: string; cls: string }> = {
  task: { icon: "✅", cls: "bg-slate-50 text-slate-700 border-slate-200" },
  lead: { icon: "📣", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  customer: { icon: "👋", cls: "bg-green-50 text-green-800 border-green-200" },
  invoice: { icon: "🧾", cls: "bg-blue-50 text-blue-800 border-blue-200" },
  meeting: { icon: "🤝", cls: "bg-indigo-50 text-indigo-800 border-indigo-200" },
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const noopSubscribe = () => () => {};

// The browser's own calendar day for a timestamp. During the server
// render (and hydration) we use the UTC day, then switch to local.
function localDay(iso: string, isClient: boolean) {
  if (!isClient) return iso.slice(0, 10);
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function CalendarGrid({
  days,
  month,
  items,
}: {
  days: string[];
  // "YYYY-MM" in month view (days outside it are dimmed), null in week view
  month: string | null;
  items: CalendarItem[];
}) {
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
  const today = localDay(new Date().toISOString(), isClient);
  const byDay = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const day = item.at ? localDay(item.at, isClient) : item.date;
    if (!day) continue;
    const list = byDay.get(day) ?? [];
    list.push(item);
    byDay.set(day, list);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => {
      // meetings in time order first, then all-day items
      if (a.at && b.at) return a.at.localeCompare(b.at);
      if (a.at) return -1;
      if (b.at) return 1;
      return a.title.localeCompare(b.title);
    });
  }

  const week = !month;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="hidden grid-cols-7 border-b border-slate-200 bg-slate-50 sm:grid">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-7">
        {days.map((day) => {
          const list = byDay.get(day) ?? [];
          const outside = month !== null && !day.startsWith(month);
          const isToday = day === today;
          // On phones, skip empty days in month view to keep it short.
          const hideOnMobile = !week && list.length === 0;
          return (
            <div
              key={day}
              className={`border-b border-slate-100 p-1.5 sm:border-r ${
                week ? "sm:min-h-64" : "sm:min-h-28"
              } ${outside ? "bg-slate-50/60" : ""} ${
                hideOnMobile ? "hidden sm:block" : ""
              }`}
            >
              <p
                className={`mb-1 text-xs font-medium ${
                  isToday
                    ? "inline-block rounded-full bg-indigo-600 px-1.5 text-white"
                    : outside
                      ? "text-slate-300"
                      : "text-slate-500"
                }`}
              >
                <span className="sm:hidden">
                  {WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]}{" "}
                </span>
                {Number(day.slice(8, 10))}
              </p>
              <ul className="space-y-1">
                {list.map((item) => {
                  const style = KIND_STYLE[item.kind];
                  const time = item.at && isClient
                    ? new Date(item.at).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : null;
                  const label = (
                    <span
                      title={`${item.title}${item.line ? ` · ${lineLabel(item.line)}` : ""}`}
                      className={`block truncate rounded border px-1.5 py-0.5 text-[11px] leading-snug ${style.cls} ${
                        item.done ? "line-through opacity-60" : ""
                      }`}
                    >
                      {style.icon} {time && <b className="font-semibold">{time} </b>}
                      {item.title}
                    </span>
                  );
                  return (
                    <li key={item.key}>
                      {item.href ? (
                        <Link href={item.href} className="block hover:opacity-80">
                          {label}
                        </Link>
                      ) : (
                        label
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
