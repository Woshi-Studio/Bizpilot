"use client";

import { useActionState, useRef, useEffect } from "react";
import { SERVICE_UNITS } from "@/lib/types";
import { createService, type ServiceFormState } from "./actions";
import BusinessLineInput from "@/components/business-line-input";

const initialState: ServiceFormState = {};

const inputClass =
  "mt-1 input";

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
      className="card p-6"
    >
      <h2 className="section-title">Add a service</h2>

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
          <label className="label">
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
          <label className="label">
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
          <label className="label">
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
          <label className="label">
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
          className="btn-primary"
        >
          {pending ? "Saving..." : "Add service"}
        </button>
      </div>
    </form>
  );
}
