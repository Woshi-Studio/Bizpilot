"use client";

import { useState } from "react";
import Icon from "./icons";
import { formatMoney } from "@/lib/types";

export type PickableService = {
  id: string;
  name: string;
  rate: number;
  unit: string;
  description: string | null;
  business_line: string | null;
  image_url?: string | null;
};

const UNIT: Record<string, string> = {
  project: "project",
  mo: "month",
  hr: "hour",
  word: "word",
  min: "minute",
};

export function unitLabel(unit: string) {
  return UNIT[unit] ?? unit;
}

// "Your services": the business line's services as one-click cards, plus
// a search over all of them. Picking one calls onPick; nothing is typed
// twice.
export default function ServicePicker({
  services,
  line,
  currency,
  onPick,
  title = "Add from your services",
}: {
  services: PickableService[];
  line?: string | null;
  currency: string;
  onPick: (s: PickableService) => void;
  title?: string;
}) {
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);

  if (!services.length) {
    return (
      <p className="text-xs text-muted">
        Tip: add your services in <a href="/services" className="link">Money → Pricing</a> and
        they show up here, one click to add.
      </p>
    );
  }

  const key = (line ?? "").toLowerCase();
  const forLine = key
    ? services.filter((s) => (s.business_line ?? "").toLowerCase() === key || !s.business_line)
    : services;
  const needle = q.trim().toLowerCase();
  const shown = searching || !forLine.length
    ? services.filter(
        (s) =>
          !needle ||
          s.name.toLowerCase().includes(needle) ||
          (s.description ?? "").toLowerCase().includes(needle)
      )
    : forLine;

  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink-2">
          {title}
          {!searching && key && forLine.length > 0 && (
            <span className="font-normal text-muted"> · {line}</span>
          )}
        </p>
        {searching ? (
          <div className="flex items-center gap-2">
            <input
              type="search"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search services"
              aria-label="Search your services"
              className="input w-48! py-1! text-xs!"
            />
            <button
              type="button"
              onClick={() => {
                setSearching(false);
                setQ("");
              }}
              className="text-xs text-muted hover:text-ink"
            >
              Done
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSearching(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline"
          >
            <Icon name="search" className="h-3.5 w-3.5" />
            Pick from all services
          </button>
        )}
      </div>
      <div className="mt-2 flex max-h-44 flex-wrap gap-2 overflow-y-auto">
        {shown.slice(0, 30).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s)}
            title={s.description ?? s.name}
            className="group flex items-center gap-2 rounded-xl border border-line bg-surface px-2.5 py-1.5 text-left text-xs transition-colors hover:border-accent"
          >
            {s.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.image_url} alt="" className="h-7 w-7 rounded-md object-cover" />
            )}
            <span>
              <span className="block font-semibold text-ink">{s.name}</span>
              <span className="text-muted">
                {formatMoney(Number(s.rate), currency)} / {unitLabel(s.unit)}
              </span>
            </span>
            <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft text-accent-text group-hover:bg-accent group-hover:text-[var(--accent-contrast)]">
              <Icon name="plus" className="h-3 w-3" />
            </span>
          </button>
        ))}
        {shown.length === 0 && <p className="text-xs text-muted">No service matches “{q}”.</p>}
      </div>
    </div>
  );
}
