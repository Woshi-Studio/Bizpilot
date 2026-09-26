"use client";

import { useActionState } from "react";
import { LEAD_CHANNELS, LEAD_STATUSES, type Lead } from "@/lib/types";
import BusinessLineInput from "@/components/business-line-input";
import { updateLead, type OutreachFormState } from "./actions";
import FormError from "@/components/form-error";

const initialState: OutreachFormState = {};

const inputClass =
  "mt-1 input";

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

      <FormError error={state.error} upgrade={state.upgrade} />
      {state.success && (
        <p className="alert-success">
          {state.success}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="lead_name" className="label">
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
          <label htmlFor="lead_email" className="label">
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
          <label htmlFor="lead_phone" className="label">
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
          <label htmlFor="lead_company" className="label">
            Company
          </label>
          <input
            id="lead_company"
            name="company"
            type="text"
            maxLength={200}
            defaultValue={lead.company ?? ""}
            
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="lead_address" className="label">
            Address
          </label>
          <input
            id="lead_address"
            name="address"
            type="text"
            maxLength={300}
            defaultValue={lead.address ?? ""}
            placeholder="Street, city"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="lead_website" className="label">
            Website
          </label>
          <input
            id="lead_website"
            name="website"
            type="text"
            maxLength={300}
            defaultValue={lead.website ?? ""}
            placeholder="example.com"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="lead_channel" className="label">
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
          <label htmlFor="lead_status" className="label">
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
          <label htmlFor="lead_follow_up" className="label">
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
          <label htmlFor="lead_message" className="label">
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
          className="btn-primary"
        >
          {pending ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}
