"use client";

import { useActionState, useRef, useEffect } from "react";
import { SERVICE_UNITS } from "@/lib/types";
import { createService, updateService, type ServiceFormState } from "./actions";
import BusinessLineInput from "@/components/business-line-input";
import FormError from "@/components/form-error";

const initialState: ServiceFormState = {};

export type EditableService = {
  id: string;
  name: string;
  rate: number;
  unit: string;
  description: string | null;
  business_line?: string | null;
  image_url?: string | null;
};

// Add a service, or edit one (pass `service`). Optional picture (JPG /
// PNG / WEBP, 2 MB) shows on the service and in the pickers.
export default function ServiceForm({
  lines,
  defaultLine,
  service,
  onDone,
}: {
  lines?: string[];
  defaultLine?: string;
  service?: EditableService;
  onDone?: () => void;
}) {
  const editing = !!service;
  const [state, formAction, pending] = useActionState(
    editing ? updateService : createService,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state.savedAt) return;
    if (editing) {
      onDone?.();
    } else {
      // Save & add another: clear and put the cursor back in Name.
      formRef.current?.reset();
      nameRef.current?.focus();
    }
  }, [state.savedAt, editing, onDone]);

  const id = service?.id ?? "new";

  return (
    <form
      ref={formRef}
      action={formAction}
      className={editing ? "rounded-2xl bg-surface-2 p-4" : "card p-6"}
    >
      {!editing && <h2 className="section-title">Add a service</h2>}
      {service && <input type="hidden" name="id" value={service.id} />}

      <FormError error={state.error} upgrade={state.upgrade} className="mt-3" />
      {state.success && !editing && <p className="mt-3 alert-success">{state.success} Add the next one.</p>}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor={`svc-name-${id}`} className="label">Service name *</label>
          <input
            ref={nameRef}
            id={`svc-name-${id}`}
            name="name"
            type="text"
            required
            defaultValue={service?.name}
            placeholder="e.g. Logo Design"
            className="mt-1 input"
          />
        </div>
        <div>
          <label htmlFor={`svc-rate-${id}`} className="label">Rate *</label>
          <input
            id={`svc-rate-${id}`}
            name="rate"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={service?.rate}
            placeholder="150"
            className="mt-1 input"
          />
        </div>
        <div>
          <label htmlFor={`svc-unit-${id}`} className="label">Unit</label>
          <select id={`svc-unit-${id}`} name="unit" defaultValue={service?.unit ?? "project"} className="mt-1 input">
            {SERVICE_UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <BusinessLineInput
            id={`service_business_line-${id}`}
            lines={lines}
            defaultValue={service ? service.business_line ?? "" : defaultLine}
            className="input"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`svc-desc-${id}`} className="label">Description (shows on tasks/invoices)</label>
          <input
            id={`svc-desc-${id}`}
            name="description"
            type="text"
            defaultValue={service?.description ?? ""}
            placeholder="What's included..."
            className="mt-1 input"
          />
        </div>
        <div className="sm:col-span-4">
          <label htmlFor={`svc-img-${id}`} className="label">
            Picture <span className="text-subtle">(optional · JPG, PNG or WEBP · up to 2 MB)</span>
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {service?.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={service.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
            )}
            <input
              id={`svc-img-${id}`}
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-3 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
            />
            {service?.image_url && (
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" name="remove_image" className="h-3.5 w-3.5" />
                Remove picture
              </label>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        {editing && (
          <button type="button" onClick={onDone} className="btn-ghost">
            Cancel
          </button>
        )}
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Saving…" : editing ? "Save changes" : "Save & add another"}
        </button>
      </div>
    </form>
  );
}
