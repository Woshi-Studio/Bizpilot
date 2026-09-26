"use client";

import Link from "next/link";
import { useActionState, useState, useSyncExternalStore } from "react";
import BusinessLineInput from "@/components/business-line-input";
import { WEEKDAY_KEYS, type TimeRange, type Weekly } from "@/lib/booking-time";
import type { BookingSettings } from "@/lib/booking";
import { saveBookingSettings, type BookingFormState } from "./actions";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // show Monday first

const noop = () => () => {};
const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto";
  } catch {
    return "America/Toronto";
  }
};
function zones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}

export default function BookingSettingsForm({
  defaults,
  base,
  lines,
  ical,
  locked,
}: {
  defaults: BookingSettings;
  base: string;
  lines: string[];
  ical: { masked: string | null; status: { fetchedAt: string | null; events: number; error: string | null } | null } | null;
  locked: boolean;
}) {
  const [state, action, pending] = useActionState(saveBookingSettings, {} as BookingFormState);
  const detected = useSyncExternalStore(noop, browserZone, () => "America/Toronto");
  const [tz, setTz] = useState<string | null>(defaults.timezone || null);
  const [slug, setSlug] = useState(defaults.slug);
  const [enabled, setEnabled] = useState(defaults.enabled && !locked);
  const [weekly, setWeekly] = useState<Weekly>(defaults.weekly);
  const [accent, setAccent] = useState(defaults.accent ?? "");
  const zone = tz ?? detected;
  const zoneList = zones();

  const setDay = (d: number, ranges: TimeRange[]) => setWeekly((w) => w.map((r, i) => (i === d ? ranges : r)));

  return (
    <form action={action} className="card space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="section-title">📅 Your link and hours</h2>
          <p className="page-sub">Times are in your time zone; visitors see them in theirs.</p>
        </div>
        <label className={`flex items-center gap-2 text-sm font-medium ${locked ? "text-subtle" : "text-ink-2"}`}>
          <input
            type="checkbox"
            name="enabled"
            checked={enabled}
            disabled={locked}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          Page is on
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">
          Link name
          <div className="mt-1 flex items-center gap-1">
            <span className="shrink-0 text-sm text-subtle">/book/</span>
            <input
              name="slug"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              maxLength={40}
              className="input"
            />
          </div>
          <span className="mt-1 block truncate text-xs font-normal text-muted">
            {base}/book/{slug || "…"}
          </span>
        </label>
        <label className="label">
          Time zone
          <select name="timezone" value={zone} onChange={(e) => setTz(e.target.value)} className="input mt-1">
            {[zone, ...zoneList.filter((z) => z !== zone)].map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <p className="label">Weekly hours</p>
        <input type="hidden" name="weekly" value={JSON.stringify(weekly)} />
        <div className="mt-2 divide-y divide-line rounded-xl border border-line">
          {ORDER.map((d) => {
            const ranges = weekly[d] ?? [];
            return (
              <div key={WEEKDAY_KEYS[d]} className="flex flex-wrap items-start gap-3 px-3 py-2.5">
                <label className="flex w-32 shrink-0 items-center gap-2 pt-1.5 text-sm font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={ranges.length > 0}
                    onChange={(e) => setDay(d, e.target.checked ? [["09:00", "17:00"]] : [])}
                    className="h-4 w-4"
                  />
                  {DAY_NAMES[d]}
                </label>
                <div className="flex flex-1 flex-col gap-2">
                  {ranges.length === 0 && <span className="pt-1.5 text-sm text-subtle">Unavailable</span>}
                  {ranges.map(([a, b], i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <input
                        type="time"
                        value={a}
                        step={900}
                        aria-label={`${DAY_NAMES[d]} start`}
                        onChange={(e) => setDay(d, ranges.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))}
                        className="input w-32! py-1.5!"
                      />
                      <span className="text-subtle">–</span>
                      <input
                        type="time"
                        value={b}
                        step={900}
                        aria-label={`${DAY_NAMES[d]} end`}
                        onChange={(e) => setDay(d, ranges.map((r, j) => (j === i ? [r[0], e.target.value] : r)))}
                        className="input w-32! py-1.5!"
                      />
                      <button
                        type="button"
                        aria-label="Remove these hours"
                        onClick={() => setDay(d, ranges.filter((_, j) => j !== i))}
                        className="btn-ghost btn-sm"
                      >
                        ✕
                      </button>
                      {i === ranges.length - 1 && ranges.length < 6 && (
                        <button
                          type="button"
                          onClick={() => setDay(d, [...ranges, ["13:00", "17:00"]])}
                          className="btn-ghost btn-sm"
                        >
                          + Add hours
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {d === 1 && ranges.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setWeekly((w) => w.map((r, i) => (i >= 1 && i <= 5 ? ranges.map((x) => [...x] as TimeRange) : r)))}
                    className="btn-ghost btn-sm text-xs"
                  >
                    Copy to Tue–Fri
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="label">
          Minimum notice (hours)
          <input name="min_notice_hours" type="number" min={0} max={720} defaultValue={defaults.min_notice_hours} className="input mt-1" />
          <span className="mt-1 block text-xs font-normal text-muted">No bookings sooner than this.</span>
        </label>
        <label className="label">
          How far ahead (days)
          <input name="horizon_days" type="number" min={1} max={365} defaultValue={defaults.horizon_days} className="input mt-1" />
        </label>
        <label className="label">
          Max bookings a day
          <input name="max_per_day" type="number" min={0} max={50} defaultValue={defaults.max_per_day ?? ""} placeholder="No limit" className="input mt-1" />
        </label>
        <label className="label">
          Buffer before (minutes)
          <input name="buffer_before_min" type="number" min={0} max={240} step={5} defaultValue={defaults.buffer_before_min} className="input mt-1" />
        </label>
        <label className="label">
          Buffer after (minutes)
          <input name="buffer_after_min" type="number" min={0} max={240} step={5} defaultValue={defaults.buffer_after_min} className="input mt-1" />
        </label>
        <label className="label">
          Page language
          <select name="language" defaultValue={defaults.language} className="input mt-1">
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="es">Español</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">
          Accent color
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              aria-label="Pick a color"
              value={/^#[0-9a-f]{6}$/i.test(accent) ? accent : "#4f46e5"}
              onChange={(e) => setAccent(e.target.value)}
              className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-surface p-1"
            />
            <input name="accent" value={accent} onChange={(e) => setAccent(e.target.value)} placeholder="Theme color" maxLength={7} className="input" />
          </div>
          <span className="mt-1 block text-xs font-normal text-muted">Empty = your theme&apos;s color. The page uses your theme (Settings → Theme).</span>
        </label>
        <BusinessLineInput id="booking_line" defaultValue={defaults.business_line} lines={lines} label="New leads go to" emptyLabel="No business line" />
      </div>

      <label className="label block">
        Intro text <span className="text-subtle">(optional)</span>
        <textarea name="intro" rows={3} maxLength={1000} defaultValue={defaults.intro ?? ""} placeholder="e.g. Pick a time for a free 30-minute chat about your project." className="input mt-1" />
      </label>

      <div className="rounded-xl border border-line bg-surface-2 p-4">
        <p className="text-sm font-semibold text-ink">Google Calendar busy times (optional)</p>
        <p className="mt-1 text-xs text-muted">
          Paste your calendar&apos;s <b>secret address in iCal format</b>{" "}(Google Calendar → Settings → your calendar →
          Integrate calendar). Jephelen only reads when you&apos;re busy, about every 15 minutes; it never changes your calendar.
        </p>
        {ical && (
          <div className="mt-2 text-xs">
            <p className="text-ink-2">
              Connected: <span className="font-mono">{ical.masked}</span>
            </p>
            {ical.status?.error ? (
              <p className="mt-1 text-red-600">Last check failed: {ical.status.error}</p>
            ) : ical.status?.fetchedAt ? (
              <p className="mt-1 text-muted">
                Last read {new Date(ical.status.fetchedAt).toLocaleString()} · {ical.status.events} busy time
                {ical.status.events === 1 ? "" : "s"}
              </p>
            ) : null}
            <label className="mt-2 flex items-center gap-2 text-ink-2">
              <input type="checkbox" name="remove_ical" className="h-4 w-4" /> Disconnect
            </label>
          </div>
        )}
        <input
          name="ical_url"
          type="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={ical ? "Paste a new address to replace it" : "https://calendar.google.com/calendar/ical/…/basic.ics"}
          className="input mt-2 font-mono text-xs"
        />
      </div>

      {state.error && (
        <p className="alert-error text-sm">
          {state.error}{" "}
          {state.upgrade && (
            <Link href="/settings#plan" className="link">
              Upgrade
            </Link>
          )}
        </p>
      )}
      {state.success && <p className="alert-success text-sm">{state.success}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Saving…" : "Save booking settings"}
        </button>
      </div>
    </form>
  );
}
