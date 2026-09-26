"use client";

import { quickDates } from "@/lib/templates";

// "Today 4pm · Tomorrow 10am · Next Monday 9am · In 3 days · …" chips
// under a date field. onPick gets YYYY-MM-DD and, for timed chips, HH:mm.
export default function DateChips({
  onPick,
  withTime = false,
  className = "",
}: {
  onPick: (date: string, time?: string) => void;
  withTime?: boolean;
  className?: string;
}) {
  const chips = quickDates();
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {chips.map((q) => (
        <button
          key={q.label}
          type="button"
          onClick={() => onPick(q.date, withTime ? q.time : undefined)}
          className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-muted hover:border-accent hover:text-accent-text"
        >
          {withTime ? q.label : q.label.replace(/ \d+(am|pm)$/, "")}
        </button>
      ))}
    </div>
  );
}

// Sets a date (and time) input by id and tells React forms about it.
export function setInputValue(id: string, value: string) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
