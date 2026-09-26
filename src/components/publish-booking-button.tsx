"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import Icon from "@/components/icons";
import BookingLinkBox from "@/components/booking-link-box";
import { publishBookingPage, type PublishResult } from "@/app/(app)/settings/booking/actions";

function browserZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

// ONE big button: turns the booking page on, fills in whatever is missing
// (link name, Mon–Fri 9–5, a 30-min call), then shows the link in a popup.
export default function PublishBookingButton({ note }: { note?: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PublishResult | null>(null);

  const publish = () =>
    start(async () => {
      const res = await publishBookingPage(browserZone());
      setResult(res);
    });

  const close = () => {
    setResult(null);
    router.refresh();
  };

  useEffect(() => {
    if (!result?.ok) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.ok]);

  return (
    <>
      <div className="card flex flex-col gap-3 border-2 border-accent/40 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className="text-base font-semibold text-ink">📅 Let clients book you</p>
          <p className="mt-0.5 text-sm text-muted">
            {note ?? "One click: your booking page goes live and you get a link to share."}
          </p>
        </div>
        <button
          type="button"
          onClick={publish}
          disabled={pending}
          className="btn-primary w-full px-6! py-3! text-base! sm:w-auto"
        >
          <Icon name="globe" className="h-5 w-5" />
          {pending ? "Publishing…" : "Publish booking page"}
        </button>
      </div>
      {result && !result.ok && (
        <p className="alert-error mt-2 text-sm">
          {result.error}{" "}
          {result.upgrade && (
            <Link href="/settings#plan" className="link">
              See plans
            </Link>
          )}
        </p>
      )}

      {result?.ok && result.url && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/40" onClick={close} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="published-title"
            className="fixed left-1/2 top-1/2 z-[61] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-5 shadow-pop sm:p-7"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-3xl" aria-hidden>
                  🎉
                </p>
                <h2 id="published-title" className="section-title mt-1 text-xl!">
                  Your booking page is live
                </h2>
                <p className="mt-1 text-sm text-muted">Copy this link and send it to clients. It stays the same.</p>
              </div>
              <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-surface-3">
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5">
              <BookingLinkBox url={result.url} variant="big" />
            </div>
            {result.created && result.created.length > 0 && (
              <p className="mt-4 rounded-xl bg-surface-2 p-3 text-xs text-ink-2">
                Set up for you: {result.created.join(" · ")}. Change it any time in{" "}
                <Link href="/settings/booking" className="link" onClick={() => setResult(null)}>
                  Settings → Booking
                </Link>
                .
              </p>
            )}
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={close} className="btn-ghost btn-sm">
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
