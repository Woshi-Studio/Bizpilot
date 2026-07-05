"use client";

import { useActionState } from "react";
import { CUSTOMER_STATUSES, type Customer } from "@/lib/types";
import type { CustomerFormState } from "./actions";

const initialState: CustomerFormState = {};

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default function CustomerForm({
  action,
  customer,
  submitLabel,
}: {
  action: (
    prevState: CustomerFormState,
    formData: FormData
  ) => Promise<CustomerFormState>;
  customer?: Customer;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {customer && <input type="hidden" name="id" value={customer.id} />}

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
          <label
            htmlFor="name"
            className="block text-sm font-medium text-slate-700"
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
            className="block text-sm font-medium text-slate-700"
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
            className="block text-sm font-medium text-slate-700"
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
            className="block text-sm font-medium text-slate-700"
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
          <label
            htmlFor="status"
            className="block text-sm font-medium text-slate-700"
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
            className="block text-sm font-medium text-slate-700"
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
          <p className="mt-1 text-xs text-slate-400">
            We&apos;ll remind you on the dashboard when it&apos;s due.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
        >
          {pending ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
