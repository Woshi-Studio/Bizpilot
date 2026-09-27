"use client";

import { useEffect, useRef, useState } from "react";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; emailed: boolean } | { kind: "error"; message: string };

export default function RemovalForm() {
  const shownAt = useRef(0);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  if (status.kind === "sent") {
    return (
      <div role="status" className="not-prose mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
        {status.emailed ? (
          <>
            <p className="font-semibold">Check your inbox.</p>
            <p className="mt-1">
              We sent a link to confirm. Open it within 72 hours and press Confirm. We remove the
              data straight away and add it to our do-not-collect list.
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold">We got your request.</p>
            <p className="mt-1">
              We&apos;ll email you to confirm, then remove the data within 30 days.
            </p>
          </>
        )}
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/remove-my-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: f.get("email"),
          company: f.get("company"),
          website: f.get("website"),
          phone: f.get("phone"),
          details: f.get("details"),
          confirm: f.get("confirm") === "yes",
          website_confirm: f.get("website_confirm"),
          shown_at: shownAt.current,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; emailed?: boolean; error?: string };
      if (data.ok) setStatus({ kind: "sent", emailed: data.emailed === true });
      else setStatus({ kind: "error", message: data.error ?? "Please try again." });
    } catch {
      setStatus({ kind: "error", message: "No connection. Please try again." });
    }
  }

  const input =
    "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

  return (
    <form onSubmit={onSubmit} className="not-prose mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <div>
        <label htmlFor="rm_email" className="block text-sm font-medium text-slate-800">
          Your email *
        </label>
        <input id="rm_email" name="email" type="email" required maxLength={254} autoComplete="email" className={input} />
        <p className="mt-1 text-xs text-slate-500">We send the confirm link here. If this email is in our records, it is removed too.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="rm_company" className="block text-sm font-medium text-slate-800">
            Business name
          </label>
          <input id="rm_company" name="company" maxLength={200} className={input} />
        </div>
        <div>
          <label htmlFor="rm_website" className="block text-sm font-medium text-slate-800">
            Website
          </label>
          <input id="rm_website" name="website" maxLength={300} placeholder="yourbusiness.ca" className={input} />
        </div>
      </div>
      <div>
        <label htmlFor="rm_phone" className="block text-sm font-medium text-slate-800">
          Phone number
        </label>
        <input id="rm_phone" name="phone" maxLength={50} autoComplete="tel" className={input} />
      </div>
      <div>
        <label htmlFor="rm_details" className="block text-sm font-medium text-slate-800">
          Anything else we should know
        </label>
        <textarea id="rm_details" name="details" maxLength={1000} rows={3} className={input} />
      </div>
      {/* Hidden from people; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Leave this empty
          <input name="website_confirm" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 h-4 w-4 shrink-0" />
        <span>This is my own data, or I&apos;m allowed to act for this business. *</span>
      </label>

      {status.kind === "error" && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {status.message}
        </p>
      )}

      <button
        type="submit"
        disabled={status.kind === "sending"}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 sm:w-auto"
      >
        {status.kind === "sending" ? "Sending..." : "Send me the confirm link"}
      </button>
    </form>
  );
}
