"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Icon from "@/components/icons";
import { bt, localeFor, locationLabel, type BookingKey } from "@/lib/booking-i18n";
import { formatMoneyCents, type IntakeQuestion } from "@/lib/booking";

export type WidgetType = {
  slug: string;
  name: string;
  duration_min: number;
  description: string | null;
  location_kind: string;
  location_detail: string | null;
  questions: IntakeQuestion[];
  deposit_cents: number | null;
};

const noop = () => () => {};
const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};
const pad = (n: number) => String(n).padStart(2, "0");
const ERRORS = ["name", "email", "phone", "required", "taken", "rate", "closed", "unavailable"];

function dayInZone(iso: string, tz: string) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  return p; // YYYY-MM-DD
}

function allZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}

// Month grid, cells are "YYYY-MM-DD" or null. Weeks start Sunday (en) or
// Monday (fr, es).
function monthCells(month: string, mondayFirst: boolean) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + (mondayFirst ? 6 : 0)) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export default function BookingWidget({
  slug,
  type,
  lang,
  businessName,
  intro,
  currency,
  shownAt,
  initialMonth,
  maxMonth,
  mode = "book",
  token,
  backHref,
}: {
  slug: string;
  type: WidgetType;
  lang: string;
  businessName: string;
  intro?: string | null;
  currency: string;
  shownAt: number;
  initialMonth: string; // YYYY-MM
  maxMonth: string; // YYYY-MM, the horizon
  mode?: "book" | "reschedule";
  token?: string;
  backHref?: string | null;
}) {
  const t = (k: BookingKey, v?: Record<string, string | number>) => bt(lang, k, v);
  const locale = localeFor(lang);
  const detected = useSyncExternalStore(noop, browserZone, () => "UTC");
  const isClient = useSyncExternalStore(noop, () => true, () => false);
  const [zoneOverride, setZoneOverride] = useState<string | null>(null);
  const [pickingZone, setPickingZone] = useState(false);
  const tz = zoneOverride ?? detected;

  const [month, setMonth] = useState(initialMonth);
  const [fetched, setFetched] = useState<{ key: string; slots: string[]; failed?: boolean } | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [step, setStep] = useState<"pick" | "form">("pick");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reload, setReload] = useState(0);
  // On a phone the times and the Continue button sit below the calendar,
  // out of sight: bring them into view when the visitor picks a day / time.
  const timesRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLDivElement>(null);
  const reveal = (ref: React.RefObject<HTMLDivElement | null>) =>
    setTimeout(() => ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);

  // Fetch the month (with a day of padding for time zones).
  const key = `${month}|${mode}|${reload}|${isClient ? "c" : "s"}`;
  useEffect(() => {
    if (!isClient) return;
    let live = true;
    const from = new Date(`${month}-01T00:00:00Z`).getTime() - 86_400_000;
    const to = new Date(`${shiftMonth(month, 1)}-01T00:00:00Z`).getTime() + 86_400_000;
    const q = new URLSearchParams({ from: new Date(from).toISOString(), to: new Date(to).toISOString() });
    if (mode === "reschedule" && token) q.set("token", token);
    else {
      q.set("slug", slug);
      q.set("type", type.slug);
    }
    fetch(`/api/book/slots?${q}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; slots?: string[] }) => {
        if (live) setFetched({ key, slots: j.ok && Array.isArray(j.slots) ? j.slots : [], failed: !j.ok });
      })
      .catch(() => live && setFetched({ key, slots: [], failed: true }));
    return () => {
      live = false;
    };
  }, [key, isClient, month, mode, token, slug, type.slug]);

  const loading = !fetched || fetched.key !== key;
  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    if (loading || !fetched) return map;
    for (const s of fetched.slots) {
      const d = dayInZone(s, tz);
      if (!d.startsWith(month)) continue;
      const list = map.get(d) ?? [];
      list.push(s);
      map.set(d, list);
    }
    return map;
  }, [fetched, loading, tz, month]);

  const mondayFirst = lang !== "en";
  const cells = monthCells(month, mondayFirst);
  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 4 + i + (mondayFirst ? 1 : 0))))
  );
  const monthTitle = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T00:00:00Z`));
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: tz });
  const longFmt = new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz });
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

  // First month with a free day: jump the selection there once loaded.
  const firstFree = [...byDay.keys()].sort()[0] ?? null;
  const shownDay = day && byDay.has(day) ? day : null;
  const times = shownDay ? byDay.get(shownDay) ?? [] : [];

  async function submit(form: HTMLFormElement) {
    if (!slot) return;
    setSending(true);
    setError(null);
    const fd = new FormData(form);
    try {
      if (mode === "reschedule") {
        const r = await fetch("/api/book/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, action: "reschedule", start: slot }),
        });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error ?? "generic");
        window.location.assign(`/booking/${token}?moved=1`);
        return;
      }
      const r = await fetch("/api/book/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          type: type.slug,
          start: slot,
          tz,
          shown_at: shownAt,
          website: fd.get("website"),
          name: fd.get("name"),
          email: fd.get("email"),
          phone: fd.get("phone"),
          note: fd.get("note"),
          answers,
        }),
      });
      const j = await r.json();
      if (!j.ok || !j.token) throw new Error(j.error ?? "generic");
      // A full page load, so the business's theme script runs there too.
      window.location.assign(`/booking/${j.token}?new=1${j.emailed ? "" : "&noemail=1"}`);
    } catch (e) {
      const code = e instanceof Error ? e.message : "generic";
      setError(t(ERRORS.includes(code) ? (`err_${code}` as BookingKey) : "err_generic"));
      if (code === "taken") {
        setSlot(null);
        setStep("pick");
        setReload((n) => n + 1);
      }
      setSending(false);
    }
  }

  const info = (
    <div className="space-y-3">
      {mode === "book" && backHref && (
        <a href={backHref} className="mb-2 inline-block text-sm text-muted hover:text-ink">
          ← {t("back")}
        </a>
      )}
      <p className="eyebrow">{businessName}</p>
      <h1 className="page-title text-2xl!">{type.name}</h1>
      <ul className="space-y-1.5 text-sm text-ink-2">
        <li className="flex items-center gap-2">
          <Icon name="calendar" className="h-4 w-4 text-muted" /> {t("minutes", { n: type.duration_min })}
        </li>
        <li className="flex items-center gap-2">
          <Icon
            name={type.location_kind === "phone" || type.location_kind === "we_call" ? "phone" : type.location_kind === "in_person" ? "pin" : "globe"}
            className="h-4 w-4 text-muted"
          />
          {locationLabel(lang, type.location_kind)}
          {type.location_detail && type.location_kind === "in_person" ? `: ${type.location_detail}` : ""}
        </li>
        {type.deposit_cents ? (
          <li className="flex items-center gap-2">
            <Icon name="money" className="h-4 w-4 text-muted" /> {formatMoneyCents(type.deposit_cents, currency, lang)}
          </li>
        ) : null}
      </ul>
      {type.description && <p className="whitespace-pre-line text-sm text-muted">{type.description}</p>}
      {intro && mode === "book" && <p className="whitespace-pre-line text-sm text-muted">{intro}</p>}
      {slot && (
        <p className="flex items-center gap-2 rounded-xl bg-accent-soft p-3 text-sm font-medium text-accent-text">
          <Icon name="check" className="h-4 w-4 shrink-0" /> {longFmt.format(new Date(slot))}
        </p>
      )}
    </div>
  );

  const zoneLine = (
    <div className="mt-4 text-xs text-muted">
      {t("times_in")} <b className="font-medium text-ink-2">{tz.replace(/_/g, " ")}</b>{" "}
      {!pickingZone ? (
        <button type="button" onClick={() => setPickingZone(true)} className="link">
          {t("change_zone")}
        </button>
      ) : (
        <select
          aria-label={t("times_in")}
          className="input mt-2 py-1.5! text-xs"
          value={tz}
          onChange={(e) => {
            setZoneOverride(e.target.value);
            setPickingZone(false);
          }}
        >
          {[tz, ...allZones().filter((z) => z !== tz)].map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  if (step === "form" && slot) {
    return (
      <div className="card grid gap-8 p-5 sm:p-8 md:grid-cols-[1fr_1.3fr]">
        {info}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(e.currentTarget);
          }}
          className="space-y-3"
        >
          <h2 className="section-title">{t("your_details")}</h2>
          <label className="label">
            {t("name")} *
            <input name="name" required maxLength={120} autoComplete="name" className="input mt-1" />
          </label>
          <label className="label">
            {t("email")} *
            <input name="email" type="email" required maxLength={254} autoComplete="email" className="input mt-1" />
          </label>
          <label className="label">
            {t("phone_optional")}
            <input name="phone" type="tel" maxLength={50} autoComplete="tel" className="input mt-1" />
          </label>
          {type.questions.map((q) => (
            <label key={q.id} className="label">
              {q.label}
              {q.required ? " *" : ""}
              {q.kind === "long" ? (
                <textarea
                  required={q.required}
                  rows={3}
                  maxLength={2000}
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  className="input mt-1"
                />
              ) : q.kind === "choice" ? (
                <select
                  required={q.required}
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  className="input mt-1"
                >
                  <option value="">{t("choose")}</option>
                  {q.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  required={q.required}
                  maxLength={300}
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  className="input mt-1"
                />
              )}
            </label>
          ))}
          <label className="label">
            {t("note")}
            <textarea name="note" rows={3} maxLength={2000} className="input mt-1" />
          </label>
          {/* Honeypot: people never see or fill this. */}
          <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          {type.deposit_cents ? (
            <p className="alert-info text-sm">{t("deposit_note", { amount: formatMoneyCents(type.deposit_cents, currency, lang) })}</p>
          ) : null}
          {error && <p className="alert-error text-sm">{error}</p>}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="submit" disabled={sending} className="btn-primary">
              {sending ? t("booking") : t("confirm")}
            </button>
            <button type="button" onClick={() => setStep("pick")} className="btn-ghost">
              {t("back")}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="card grid gap-6 p-5 sm:p-8 lg:grid-cols-[1fr_1.4fr_0.9fr]">
      {info}

      <div>
        <h2 className="section-title">{t("pick_day")}</h2>
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            disabled={month <= initialMonth}
            aria-label={t("prev_month")}
            className="btn-ghost btn-sm disabled:opacity-30"
          >
            ‹
          </button>
          <p className="text-sm font-semibold capitalize text-ink">{monthTitle}</p>
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            disabled={month >= maxMonth}
            aria-label={t("next_month")}
            className="btn-ghost btn-sm disabled:opacity-30"
          >
            ›
          </button>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-subtle">
          {weekdayNames.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((c, i) => {
            if (!c) return <div key={`e${i}`} />;
            const open = byDay.has(c);
            const selected = c === shownDay;
            return (
              <button
                key={c}
                type="button"
                disabled={!open}
                onClick={() => {
                  setDay(c);
                  setSlot(null);
                  reveal(timesRef);
                }}
                aria-pressed={selected}
                className={`aspect-square rounded-full text-sm transition-colors ${
                  selected
                    ? "font-semibold text-[var(--accent-contrast)]"
                    : open
                      ? "bg-accent-soft font-semibold text-accent-text hover:brightness-95"
                      : "text-subtle"
                }`}
                style={selected ? { background: "var(--accent)" } : undefined}
              >
                {Number(c.slice(8))}
              </button>
            );
          })}
        </div>
        {loading ? (
          <p className="mt-3 text-sm text-muted">{t("loading")}</p>
        ) : byDay.size === 0 ? (
          <div className="mt-3 text-sm text-muted">
            {fetched?.failed ? t("err_unavailable") : t("no_times")}{" "}
            {!fetched?.failed && month < maxMonth && (
              <button type="button" className="link" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
                {t("next_month")} →
              </button>
            )}
          </div>
        ) : null}
        {zoneLine}
      </div>

      <div ref={timesRef} className="scroll-mt-4">
        <h2 className="section-title">{shownDay ? dayFmt.format(new Date(`${shownDay}T12:00:00Z`)) : t("pick_time")}</h2>
        {!shownDay && !loading && firstFree && (
          <button type="button" onClick={() => setDay(firstFree)} className="link mt-3 text-sm">
            {dayFmt.format(new Date(`${firstFree}T12:00:00Z`))} →
          </button>
        )}
        <div className="mt-3 grid max-h-[26rem] grid-cols-2 gap-2 overflow-y-auto pr-1 lg:grid-cols-1">
          {times.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSlot(s);
                reveal(continueRef);
              }}
              aria-pressed={slot === s}
              className={slot === s ? "btn-primary justify-center" : "btn-secondary justify-center"}
            >
              {timeFmt.format(new Date(s))}
            </button>
          ))}
        </div>
        {slot && (
          <div ref={continueRef} className="mt-4 space-y-2 scroll-mb-4">
            {error && <p className="alert-error text-sm">{error}</p>}
            {mode === "reschedule" ? (
              <button type="button" disabled={sending} onClick={() => submit(document.createElement("form"))} className="btn-primary w-full justify-center">
                {sending ? t("booking") : `${t("reschedule")} → ${timeFmt.format(new Date(slot))}`}
              </button>
            ) : (
              <button type="button" onClick={() => setStep("form")} className="btn-primary w-full justify-center">
                {t("your_details")} →
              </button>
            )}
          </div>
        )}
        {!slot && error && <p className="alert-error mt-3 text-sm">{error}</p>}
      </div>
    </div>
  );
}
