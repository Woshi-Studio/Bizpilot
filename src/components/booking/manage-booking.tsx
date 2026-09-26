"use client";

import { useState, useSyncExternalStore } from "react";
import Icon from "@/components/icons";
import BookingWidget, { type WidgetType } from "./booking-widget";
import { bt, localeFor, locationLabel, type BookingKey } from "@/lib/booking-i18n";
import { formatMoneyCents } from "@/lib/booking";

const noop = () => () => {};
const zone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};
const gcalStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export default function ManageBooking({
  token,
  lang,
  businessName,
  currency,
  booking,
  type,
  slug,
  bookAgainHref,
  isNew,
  moved,
  emailed,
  open,
  past,
  shownAt,
  initialMonth,
  maxMonth,
}: {
  token: string;
  lang: string;
  businessName: string;
  currency: string;
  booking: {
    type_name: string;
    starts_at: string;
    ends_at: string;
    status: string;
    email: string;
    location_kind: string;
    location_detail: string | null;
    visitor_tz: string | null;
    deposit_cents: number | null;
  };
  type: WidgetType | null;
  slug: string;
  bookAgainHref: string;
  isNew: boolean;
  moved: boolean;
  emailed: boolean;
  open: "reschedule" | "cancel" | null;
  past: boolean;
  shownAt: number;
  initialMonth: string;
  maxMonth: string;
}) {
  const t = (k: BookingKey, v?: Record<string, string | number>) => bt(lang, k, v);
  const browserTz = useSyncExternalStore(noop, zone, () => booking.visitor_tz ?? "UTC");
  const [mode, setMode] = useState<"view" | "reschedule" | "cancel">(open && !past ? open : "view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const when = new Intl.DateTimeFormat(localeFor(lang), {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: browserTz,
    timeZoneName: "short",
  }).format(new Date(booking.starts_at));
  const where = booking.location_detail
    ? `${locationLabel(lang, booking.location_kind)}: ${booking.location_detail}`
    : locationLabel(lang, booking.location_kind);

  const cancelled = booking.status === "cancelled";
  const active = booking.status === "confirmed" && !past;

  const gcal = `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: "TEMPLATE",
    text: `${booking.type_name} · ${businessName}`,
    dates: `${gcalStamp(booking.starts_at)}/${gcalStamp(booking.ends_at)}`,
    details: where,
    ...(booking.location_detail ? { location: booking.location_detail } : {}),
  })}`;

  async function cancel() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/book/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "cancel" }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!j.ok) {
      setError(t(j.error === "closed" ? "err_closed" : "err_generic"));
      setBusy(false);
      return;
    }
    window.location.assign(`/booking/${token}`);
  }

  if (mode === "reschedule" && type && active) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="page-title">{t("pick_new_time")}</h1>
          <button type="button" onClick={() => setMode("view")} className="btn-ghost btn-sm">
            {t("keep_time")}
          </button>
        </div>
        <BookingWidget
          slug={slug}
          type={type}
          lang={lang}
          businessName={businessName}
          currency={currency}
          shownAt={shownAt}
          initialMonth={initialMonth}
          maxMonth={maxMonth}
          mode="reschedule"
          token={token}
        />
      </div>
    );
  }

  const title = cancelled
    ? t("cancelled_title")
    : moved
      ? t("rescheduled_title")
      : isNew
        ? t("confirmed_title")
        : booking.type_name;

  return (
    <div className="mx-auto max-w-xl">
      <div className="card p-6 sm:p-8">
        <span
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: cancelled ? "var(--surface-3)" : "var(--accent-soft)", color: cancelled ? "var(--muted)" : "var(--accent-text)" }}
        >
          <Icon name={cancelled ? "x" : "check"} className="h-6 w-6" />
        </span>
        <h1 className="page-title mt-2">{title}</h1>
        {cancelled ? (
          <p className="page-sub">{t("cancelled_sub")}</p>
        ) : isNew || moved ? (
          <p className="page-sub">{emailed ? t("confirmed_sub", { email: booking.email }) : t("confirmed_no_email")}</p>
        ) : null}

        <dl className={`mt-6 space-y-3 text-sm ${cancelled ? "opacity-60 line-through" : ""}`}>
          <div>
            <dt className="eyebrow">{t("with")}</dt>
            {/* The meeting name is already the heading; "With" is who. */}
            <dd className="mt-0.5 text-ink">{businessName}</dd>
          </div>
          <div>
            <dt className="eyebrow">{t("when")}</dt>
            <dd className="mt-0.5 font-semibold text-ink">{when}</dd>
          </div>
          <div>
            <dt className="eyebrow">{t("where")}</dt>
            <dd className="mt-0.5 text-ink">{where}</dd>
          </div>
        </dl>

        {booking.deposit_cents && !cancelled ? (
          <p className="alert-info mt-4 text-sm">{t("deposit_note", { amount: formatMoneyCents(booking.deposit_cents, currency, lang) })}</p>
        ) : null}

        {booking.status === "attended" && <p className="alert-success mt-4 text-sm">{t("status_attended")}</p>}
        {booking.status === "no_show" && <p className="alert-warn mt-4 text-sm">{t("status_no_show")}</p>}
        {booking.status === "confirmed" && past && <p className="alert-info mt-4 text-sm">{t("past")}</p>}

        {!cancelled && (
          <div className="mt-6">
            <p className="eyebrow">{t("add_to_calendar")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a href={gcal} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
                {t("google_calendar")}
              </a>
              <a href={`/booking/${token}/ics`} className="btn-secondary btn-sm">
                {t("download_ics")}
              </a>
            </div>
          </div>
        )}

        {active && mode === "view" && (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
            {type && (
              <button type="button" onClick={() => setMode("reschedule")} className="btn-primary btn-sm">
                {t("reschedule")}
              </button>
            )}
            <button type="button" onClick={() => setMode("cancel")} className="btn-ghost btn-sm text-red-600">
              {t("cancel")}
            </button>
          </div>
        )}

        {active && mode === "cancel" && (
          <div className="mt-6 rounded-xl border border-line bg-surface-2 p-4">
            <p className="text-sm font-medium text-ink">{t("cancel_confirm")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={cancel} className="btn-danger btn-sm">
                {t("cancel")}
              </button>
              <button type="button" onClick={() => setMode("view")} className="btn-ghost btn-sm">
                {t("keep_time")}
              </button>
            </div>
          </div>
        )}

        {error && <p className="alert-error mt-4 text-sm">{error}</p>}

        {(cancelled || past) && (
          <a href={bookAgainHref} className="btn-primary btn-sm mt-6">
            {t("book_again")}
          </a>
        )}
      </div>
    </div>
  );
}
