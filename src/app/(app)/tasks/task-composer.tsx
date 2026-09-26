"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import type { Service } from "@/lib/types";
import { createTask, type TaskFormState } from "./actions";
import BusinessLineInput from "@/components/business-line-input";

const initialState: TaskFormState = {};

export default function TaskComposer({
  customers,
  services,
  lines,
  defaultLine,
}: {
  customers: { id: string; name: string }[];
  services: Service[];
  lines?: string[];
  defaultLine?: string;
}) {
  const [state, formAction, pending] = useActionState(
    createTask,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [serviceId, setServiceId] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");

  // Clear the controlled fields while rendering (not in an effect) when a
  // new successful result arrives.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) {
      setServiceId("");
      setValue("");
      setDescription("");
    }
  }

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state]);

  function onServiceChange(id: string) {
    setServiceId(id);
    const svc = services.find((s) => s.id === id);
    if (svc) {
      if (svc.unit === "project" || svc.unit === "mo") {
        setValue(String(svc.rate));
      }
      if (svc.description) setDescription(svc.description);
    }
  }

  const inputClass =
    "block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <form ref={formRef} action={formAction} className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            name="title"
            required
            placeholder="What needs doing? e.g. Send quote to John"
            className={`${inputClass} flex-1`}
          />
          <input
            type="date"
            name="due_date"
            className={`${inputClass} sm:w-40`}
          />
          <select
            name="customer_id"
            defaultValue=""
            className={`${inputClass} sm:w-44`}
          >
            <option value="">No customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {services.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              name="service_id"
              value={serviceId}
              onChange={(e) => onServiceChange(e.target.value)}
              className={`${inputClass} sm:flex-1`}
            >
              <option value="">No service (custom)</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              name="value"
              step="0.01"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Value $"
              className={`${inputClass} sm:w-32`}
            />
          </div>
        )}

        <BusinessLineInput
          id="task_business_line"
          lines={lines}
          defaultValue={defaultLine}
          showLabel={false}
          label="Business (empty = the customer's business)"
          className={inputClass}
        />

        <textarea
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Description (shows on the invoice)"
          className={inputClass}
        />

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
          >
            {pending ? "Adding..." : "Add task"}
          </button>
        </div>
      </form>
      {state.error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </div>
  );
}
