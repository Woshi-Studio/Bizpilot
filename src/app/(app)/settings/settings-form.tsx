"use client";

import { useActionState } from "react";
import { BUSINESS_TYPES } from "@/lib/types";
import { updateSettings, type SettingsState } from "./actions";

const initialState: SettingsState = {};

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"];

export default function SettingsForm({
  defaults,
}: {
  defaults: {
    fullName: string;
    email: string;
    businessName: string;
    businessType: string;
    description: string;
    currency: string;
  };
}) {
  const [state, formAction, pending] = useActionState(
    updateSettings,
    initialState
  );

  const inputClass =
    "mt-1 input";

  return (
    <form action={formAction} className="space-y-8">
      {state.error && (
        <p className="alert-error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="alert-success">
          {state.success}
        </p>
      )}

      <section className="card p-6">
        <h2 className="section-title">Your profile</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="full_name"
              className="label"
            >
              Full name
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              required
              defaultValue={defaults.fullName}
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="email"
              className="label"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              disabled
              value={defaults.email}
              className={`${inputClass} bg-slate-50 text-slate-400`}
            />
            <p className="mt-1 text-xs text-slate-400">
              To change it, use &quot;Login email&quot; below.
            </p>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="section-title">Your business</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="business_name"
              className="label"
            >
              Business name
            </label>
            <input
              id="business_name"
              name="business_name"
              type="text"
              required
              defaultValue={defaults.businessName}
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="business_type"
              className="label"
            >
              Type of work
            </label>
            <select
              id="business_type"
              name="business_type"
              required
              defaultValue={defaults.businessType}
              className={inputClass}
            >
              {BUSINESS_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="description"
              className="label"
            >
              Description <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={defaults.description}
              placeholder="What do you do, and for whom?"
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="currency"
              className="label"
            >
              Currency
            </label>
            <select
              id="currency"
              name="currency"
              defaultValue={defaults.currency}
              className={inputClass}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary"
        >
          {pending ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}
