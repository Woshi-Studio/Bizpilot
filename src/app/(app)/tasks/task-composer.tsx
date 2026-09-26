"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import type { Service } from "@/lib/types";
import { createTask, type TaskFormState } from "./actions";
import BusinessLineInput from "@/components/business-line-input";
import FormError from "@/components/form-error";

const initialState: TaskFormState = {};

export default function TaskComposer({
  customers,
  services,
  lines,
  defaultLine,
  defaultCustomerId,
}: {
  customers: { id: string; name: string }[];
  services: Service[];
  lines?: string[];
  defaultLine?: string;
  defaultCustomerId?: string;
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
    "input";

  return (
    <div className="card p-4">
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
            defaultValue={defaultCustomerId ?? ""}
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
            className="shrink-0 btn-primary"
          >
            {pending ? "Adding..." : "Add task"}
          </button>
        </div>
      </form>
      <FormError error={state.error} upgrade={state.upgrade} className="mt-2" />
    </div>
  );
}
