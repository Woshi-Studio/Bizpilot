"use client";

import { useActionState } from "react";
import { LEAD_CHANNELS, LEAD_STATUSES, type Lead } from "@/lib/types";
import BusinessLineInput from "@/components/business-line-input";
import { updateLead, type OutreachFormState } from "./actions";

const initialState: OutreachFormState = {};

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default function LeadForm({
  lead,
  lines,
}: {
  lead: Lead;
  lines?: string[];
}) {
  const [state, formAction, pending] = useActionState(updateLead, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={lead.id} />

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="lead_name" className="block text-sm font-medium text-slate-700">
            Name *
          </label>
          <input
            id="lead_name"
            name="name"
            type="text"
            required
            maxLength={200}
            defaultValue={lead.name}
            className={inputClass}
          />
        </div>
        <BusinessLineInput
          id="lead_business_line"
          defaultValue={lead.business_line}
          lines={lines}
          className={inputClass}
        />
        <div>
          <label htmlFor="lead_email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="lead_email"
            name="email"
            type="email"
            maxLength={320}
            defaultValue={lead.email ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="lead_phone" className="block text-sm font-medium text-slate-700">
            Phone
          </label>
          <input
            id="lead_phone"
            name="phone"
            type="tel"
            maxLength={50}
            defaultValue={lead.phone ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="lead_channel" className="block text-sm font-medium text-slate-700">
            Channel
          </label>
          <select
            id="lead_channel"
            name="channel"
            defaultValue={lead.channel}
            className={inputClass}
          >
            {LEAD_CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="lead_status" className="block text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id="lead_status"
            name="status"
            defaultValue={lead.status}
            className={inputClass}
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="lead_follow_up" className="block text-sm font-medium text-slate-700">
            Follow-up date
          </label>
          <input
            id="lead_follow_up"
            name="follow_up_date"
            type="date"
            defaultValue={lead.follow_up_date ?? ""}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="lead_message" className="block text-sm font-medium text-slate-700">
            Notes
          </label>
          <textarea
            id="lead_message"
            name="message"
            rows={3}
            maxLength={2000}
            defaultValue={lead.message ?? ""}
            className={inputClass}
          />
        </div>
      </div>

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
