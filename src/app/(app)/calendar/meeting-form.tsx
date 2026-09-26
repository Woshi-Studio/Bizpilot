"use client";

import { useActionState, useEffect, useRef } from "react";
import BusinessLineInput from "@/components/business-line-input";
import {
  addMeeting,
  type ActivityFormState,
} from "@/app/(app)/activities/actions";

const initialState: ActivityFormState = {};

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default function MeetingForm({
  customers,
  leads,
  lines,
  defaultLine,
}: {
  customers: { id: string; name: string }[];
  leads: { id: string; name: string }[];
  lines?: string[];
  defaultLine?: string;
}) {
  const [state, formAction, pending] = useActionState(addMeeting, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={(formData: FormData) => {
        // The server needs the browser's time zone to store the right moment.
        formData.set("tz_offset", String(new Date().getTimezoneOffset()));
        formAction(formData);
      }}
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-slate-800">🤝 Add meeting</h2>

      {state.error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {state.success}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor="meeting_title" className="block text-sm font-medium text-slate-700">
            Title *
          </label>
          <input
            id="meeting_title"
            name="subject"
            type="text"
            required
            maxLength={300}
            placeholder="e.g. Call with Greg (LanguageLine)"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="meeting_date" className="block text-sm font-medium text-slate-700">
            Date *
          </label>
          <input id="meeting_date" name="date" type="date" required className={inputClass} />
        </div>
        <div>
          <label htmlFor="meeting_time" className="block text-sm font-medium text-slate-700">
            Time
          </label>
          <input id="meeting_time" name="time" type="time" className={inputClass} />
        </div>
        <div>
          <label htmlFor="meeting_customer" className="block text-sm font-medium text-slate-700">
            Customer
          </label>
          <select id="meeting_customer" name="customer_id" defaultValue="" className={inputClass}>
            <option value="">None</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="meeting_lead" className="block text-sm font-medium text-slate-700">
            Lead
          </label>
          <select id="meeting_lead" name="lead_id" defaultValue="" className={inputClass}>
            <option value="">None</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <BusinessLineInput
            id="meeting_business_line"
            lines={lines}
            defaultValue={defaultLine}
            label="Business (empty = the contact's business)"
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-4">
          <label htmlFor="meeting_body" className="block text-sm font-medium text-slate-700">
            Notes
          </label>
          <input
            id="meeting_body"
            name="body"
            type="text"
            maxLength={5000}
            placeholder="Agenda, link, phone number..."
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Add meeting"}
        </button>
      </div>
    </form>
  );
}
