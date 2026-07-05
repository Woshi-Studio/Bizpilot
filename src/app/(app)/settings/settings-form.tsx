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
    "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <form action={formAction} className="space-y-8">
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {state.success}
        </p>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Your profile</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="full_name"
              className="block text-sm font-medium text-slate-700"
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
              className="block text-sm font-medium text-slate-700"
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
              Email changes aren&apos;t supported yet.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Your business</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="business_name"
              className="block text-sm font-medium text-slate-700"
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
              className="block text-sm font-medium text-slate-700"
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
              className="block text-sm font-medium text-slate-700"
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
              className="block text-sm font-medium text-slate-700"
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
          className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}
