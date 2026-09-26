"use client";

import { useActionState, useEffect, useRef } from "react";
import BusinessLineInput from "@/components/business-line-input";
import {
  addMeeting,
  type ActivityFormState,
} from "@/app/(app)/activities/actions";

const initialState: ActivityFormState = {};

const inputClass =
  "mt-1 input";

export default function MeetingForm({
  customers,
  leads,
  lines,
  defaultLine,
  defaultCustomerId,
  defaultLeadId,
}: {
  customers: { id: string; name: string }[];
  leads: { id: string; name: string }[];
  lines?: string[];
  defaultLine?: string;
  defaultCustomerId?: string;
  defaultLeadId?: string;
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
      className="card p-6"
    >
      <h2 className="section-title">🤝 Add meeting</h2>

      {state.error && (
        <p className="mt-3 alert-error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="mt-3 alert-success">
          {state.success}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor="meeting_title" className="label">
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
          <label htmlFor="meeting_date" className="label">
            Date *
          </label>
          <input id="meeting_date" name="date" type="date" required className={inputClass} />
        </div>
        <div>
          <label htmlFor="meeting_time" className="label">
            Time
          </label>
          <input id="meeting_time" name="time" type="time" className={inputClass} />
        </div>
        <div>
          <label htmlFor="meeting_customer" className="label">
            Customer
          </label>
          <select id="meeting_customer" name="customer_id" defaultValue={defaultCustomerId ?? ""} className={inputClass}>
            <option value="">None</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="meeting_lead" className="label">
            Lead
          </label>
          <select id="meeting_lead" name="lead_id" defaultValue={defaultLeadId ?? ""} className={inputClass}>
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
          <label htmlFor="meeting_body" className="label">
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
          className="btn-primary"
        >
          {pending ? "Saving..." : "Add meeting"}
        </button>
      </div>
    </form>
  );
}
