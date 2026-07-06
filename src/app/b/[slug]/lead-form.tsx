"use client";

import { useActionState } from "react";
import { submitLead, type LeadFormState } from "./actions";

const initialState: LeadFormState = {};

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default function LeadForm({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState(
    submitLead,
    initialState
  );

  if (state.success) {
    return (
      <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
        {state.success}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="business_id" value={businessId} />
      {/* Honeypot — hidden from humans, catnip for bots */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />

      <div>
        <label
          htmlFor="lead_name"
          className="block text-sm font-medium text-slate-700"
        >
          Your name
        </label>
        <input
          id="lead_name"
          name="name"
          type="text"
          required
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="lead_email"
            className="block text-sm font-medium text-slate-700"
          >
            Email
          </label>
          <input id="lead_email" name="email" type="email" className={inputClass} />
        </div>
        <div>
          <label
            htmlFor="lead_phone"
            className="block text-sm font-medium text-slate-700"
          >
            Phone
          </label>
          <input id="lead_phone" name="phone" type="tel" className={inputClass} />
        </div>
      </div>
      <div>
        <label
          htmlFor="lead_message"
          className="block text-sm font-medium text-slate-700"
        >
          What do you need?
        </label>
        <textarea
          id="lead_message"
          name="message"
          rows={3}
          className={inputClass}
        />
      </div>
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending ? "Sending..." : "Send message"}
      </button>
    </form>
  );
}
