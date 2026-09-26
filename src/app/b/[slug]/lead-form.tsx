"use client";

import { useActionState } from "react";
import { submitLead, type LeadFormState } from "./actions";

const initialState: LeadFormState = {};

const inputClass =
  "mt-1 input";

export default function LeadForm({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState(
    submitLead,
    initialState
  );

  if (state.success) {
    return (
      <p className="alert-success">
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
          className="label"
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
            className="label"
          >
            Email
          </label>
          <input id="lead_email" name="email" type="email" className={inputClass} />
        </div>
        <div>
          <label
            htmlFor="lead_phone"
            className="label"
          >
            Phone
          </label>
          <input id="lead_phone" name="phone" type="tel" className={inputClass} />
        </div>
      </div>
      <div>
        <label
          htmlFor="lead_message"
          className="label"
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
        <p className="alert-error">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full btn-primary"
      >
        {pending ? "Sending..." : "Send message"}
      </button>
    </form>
  );
}
