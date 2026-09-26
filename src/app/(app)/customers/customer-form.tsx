"use client";

import { useActionState } from "react";
import { CUSTOMER_STATUSES, type Customer } from "@/lib/types";
import type { CustomerFormState } from "./actions";
import BusinessLineInput from "@/components/business-line-input";
import FormError from "@/components/form-error";
import DateChips, { setInputValue } from "@/components/date-chips";

const initialState: CustomerFormState = {};

const inputClass =
  "mt-1 input";

export default function CustomerForm({
  action,
  customer,
  submitLabel,
  lines,
}: {
  action: (
    prevState: CustomerFormState,
    formData: FormData
  ) => Promise<CustomerFormState>;
  customer?: Customer;
  submitLabel: string;
  lines?: string[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {customer && <input type="hidden" name="id" value={customer.id} />}

      <FormError error={state.error} upgrade={state.upgrade} />
      {state.success && (
        <p className="alert-success">
          {state.success}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="name"
            className="label"
          >
            Name *
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={customer?.name ?? ""}
            placeholder="e.g. John Smith"
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="company"
            className="label"
          >
            Company
          </label>
          <input
            id="company"
            name="company"
            type="text"
            defaultValue={customer?.company ?? ""}
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
            name="email"
            type="email"
            defaultValue={customer?.email ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="phone"
            className="label"
          >
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={customer?.phone ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="address" className="label">
            Address
          </label>
          <input
            id="address"
            name="address"
            type="text"
            maxLength={300}
            defaultValue={customer?.address ?? ""}
            placeholder="Street, city"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="website" className="label">
            Website
          </label>
          <input
            id="website"
            name="website"
            type="text"
            maxLength={300}
            defaultValue={customer?.website ?? ""}
            placeholder="example.com"
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="status"
            className="label"
          >
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={customer?.status ?? "lead"}
            className={inputClass}
          >
            {CUSTOMER_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="next_follow_up"
            className="label"
          >
            Next follow-up
          </label>
          <input
            id="next_follow_up"
            name="next_follow_up"
            type="date"
            defaultValue={customer?.next_follow_up ?? ""}
            className={inputClass}
          />
          <DateChips className="mt-1.5" onPick={(d) => setInputValue("next_follow_up", d)} />
          <p className="mt-1 text-xs text-slate-400">
            We&apos;ll remind you on the dashboard when it&apos;s due.
          </p>
        </div>
        <BusinessLineInput
          id="business_line"
          defaultValue={customer?.business_line}
          lines={lines}
          className={inputClass}
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary"
        >
          {pending ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
