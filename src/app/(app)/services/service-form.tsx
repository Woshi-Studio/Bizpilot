"use client";

import { useActionState, useRef, useEffect } from "react";
import { SERVICE_UNITS } from "@/lib/types";
import { createService, type ServiceFormState } from "./actions";
import BusinessLineInput from "@/components/business-line-input";

const initialState: ServiceFormState = {};

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default function ServiceForm({
  lines,
  defaultLine,
}: {
  lines?: string[];
  defaultLine?: string;
}) {
  const [state, formAction, pending] = useActionState(
    createService,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-slate-800">Add a service</h2>

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
          <label className="block text-sm font-medium text-slate-700">
            Service name *
          </label>
          <input
            name="name"
            type="text"
            required
            placeholder="e.g. Logo Design"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Rate *
          </label>
          <input
            name="rate"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="150"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Unit
          </label>
          <select name="unit" defaultValue="project" className={inputClass}>
            {SERVICE_UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <BusinessLineInput
            id="service_business_line"
            lines={lines}
            defaultValue={defaultLine}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700">
            Description (shows on tasks/invoices)
          </label>
          <input
            name="description"
            type="text"
            placeholder="What's included..."
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
          {pending ? "Saving..." : "Add service"}
        </button>
      </div>
    </form>
  );
}
