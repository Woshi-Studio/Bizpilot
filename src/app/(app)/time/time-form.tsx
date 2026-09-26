"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { logTime, type TimeFormState } from "./actions";

const initialState: TimeFormState = {};

const inputClass =
  "mt-1 input";

export default function TimeForm({
  customers,
  tasks,
}: {
  customers: { id: string; name: string }[];
  tasks: { id: string; title: string; customer_id: string | null }[];
}) {
  const [state, formAction, pending] = useActionState(logTime, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [customerId, setCustomerId] = useState("");

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  const filteredTasks = customerId
    ? tasks.filter((t) => t.customer_id === customerId)
    : tasks;

  return (
    <form
      ref={formRef}
      action={formAction}
      className="card p-6"
    >
      <h2 className="section-title">Log hours</h2>

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
        <div>
          <label className="label">
            Customer
          </label>
          <select
            name="customer_id"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className={inputClass}
          >
            <option value="">None</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">
            Task (optional)
          </label>
          <select name="task_id" className={inputClass}>
            <option value="">None</option>
            {filteredTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">
            Hours *
          </label>
          <input
            name="hours"
            type="number"
            step="0.25"
            min="0.25"
            required
            placeholder="1.5"
            className={inputClass}
          />
        </div>
        <div>
          <label className="label">
            Date
          </label>
          <input
            name="entry_date"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-3">
          <label className="label">
            Description
          </label>
          <input
            name="description"
            type="text"
            placeholder="e.g. Client call, research..."
            className={inputClass}
          />
        </div>
        <div>
          <label className="label">
            Billing status
          </label>
          <select name="billed" defaultValue="unbilled" className={inputClass}>
            <option value="unbilled">Unbilled</option>
            <option value="billed">Billed</option>
            <option value="included">Included (flat rate)</option>
          </select>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary"
        >
          {pending ? "Saving..." : "Log entry"}
        </button>
      </div>
    </form>
  );
}
