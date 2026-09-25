"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { logTime, type TimeFormState } from "./actions";

const initialState: TimeFormState = {};

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

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
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-slate-800">Log hours</h2>

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
        <div>
          <label className="block text-sm font-medium text-slate-700">
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
          <label className="block text-sm font-medium text-slate-700">
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
          <label className="block text-sm font-medium text-slate-700">
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
          <label className="block text-sm font-medium text-slate-700">
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
          <label className="block text-sm font-medium text-slate-700">
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
          <label className="block text-sm font-medium text-slate-700">
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
          className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Log entry"}
        </button>
      </div>
    </form>
  );
}
