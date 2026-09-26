"use client";

import { useActionState } from "react";
import { removeBookingLogo, uploadBookingLogo, type BookingFormState } from "./actions";

export default function LogoForm({ logo, hasSettings }: { logo: string | null; hasSettings: boolean }) {
  const [state, action, pending] = useActionState(uploadBookingLogo, {} as BookingFormState);
  return (
    <section className="card p-6">
      <h2 className="section-title">🖼 Logo</h2>
      <p className="page-sub">Shown at the top of your booking page. PNG, JPG or WEBP, up to 512 KB.</p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="Your logo" className="h-16 w-16 rounded-xl border border-line object-contain" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-line text-xs text-subtle">
            No logo
          </div>
        )}
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={!hasSettings}
            className="text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-3 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
          />
          <button type="submit" disabled={pending || !hasSettings} className="btn-secondary btn-sm">
            {pending ? "Uploading…" : "Upload"}
          </button>
        </form>
        {logo && (
          <form action={removeBookingLogo}>
            <button type="submit" className="btn-ghost btn-sm text-red-600">
              Remove
            </button>
          </form>
        )}
      </div>
      {!hasSettings && <p className="mt-2 text-xs text-muted">Save your booking settings first.</p>}
      {state.error && <p className="alert-error mt-3 text-sm">{state.error}</p>}
      {state.success && <p className="alert-success mt-3 text-sm">{state.success}</p>}
    </section>
  );
}
