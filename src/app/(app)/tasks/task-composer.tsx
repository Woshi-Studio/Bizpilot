"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import type { Service } from "@/lib/types";
import { createTask, type TaskFormState } from "./actions";
import BusinessLineInput from "@/components/business-line-input";
import FormError from "@/components/form-error";
import ServicePicker, { type PickableService } from "@/components/service-picker";
import Icon from "@/components/icons";

const initialState: TaskFormState = {};

export default function TaskComposer({
  customers,
  services,
  lines,
  defaultLine,
  defaultCustomerId,
  currency = "USD",
}: {
  customers: { id: string; name: string }[];
  services: (Service | PickableService)[];
  currency?: string;
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
  const [title, setTitle] = useState("");
  const [line, setLine] = useState(defaultLine ?? "");

  // Clear the controlled fields while rendering (not in an effect) when a
  // new successful result arrives.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) {
      setServiceId("");
      setValue("");
      setDescription("");
      setTitle("");
    }
  }

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state]);

  // Picking a service fills the task: title (if empty), value, description.
  function pickService(svc: PickableService) {
    setServiceId(svc.id);
    if (!title.trim()) setTitle(svc.name);
    setValue(String(svc.rate));
    if (svc.description) setDescription(svc.description);
  }
  const picked = services.find((s) => s.id === serviceId);

  const inputClass =
    "input";

  return (
    <div className="card p-4">
      <form ref={formRef} action={formAction} className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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

        <ServicePicker
          services={services as PickableService[]}
          line={line}
          currency={currency}
          onPick={pickService}
          title="Pick from your services"
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input type="hidden" name="service_id" value={serviceId} />
          {picked ? (
            <span className="inline-flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-xs font-medium text-accent-text sm:flex-1">
              Service: {picked.name}
              <button
                type="button"
                onClick={() => setServiceId("")}
                aria-label="Remove service"
                className="ml-auto rounded p-0.5 hover:bg-surface"
              >
                <Icon name="x" className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : (
            <span className="text-xs text-muted sm:flex-1">No service picked (a custom task).</span>
          )}
          <input
            type="number"
            name="value"
            step="0.01"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`Value (${currency})`}
            className={`${inputClass} sm:w-36`}
          />
        </div>

        <BusinessLineInput
          id="task_business_line"
          lines={lines}
          value={line}
          onChange={setLine}
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
