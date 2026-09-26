"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ACTIVITY_KINDS, MANUAL_ACTIVITY_KINDS } from "@/lib/activities";
import {
  addActivity,
  type ActivityFormState,
} from "@/app/(app)/activities/actions";

const initialState: ActivityFormState = {};

const inputClass =
  "block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

// Manual log for notes, calls, meetings (and emails sent outside the app).
export default function AddActivityForm({
  customerId,
  leadId,
}: {
  customerId?: string;
  leadId?: string;
}) {
  const [state, formAction, pending] = useActionState(addActivity, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-600"
        >
          + Add activity
        </button>
        {state.success && (
          <span className="text-sm text-green-700">{state.success}</span>
        )}
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={(formData: FormData) => {
        // The server needs the browser's time zone to store the right moment.
        formData.set("tz_offset", String(new Date().getTimezoneOffset()));
        formAction(formData);
      }}
      className="space-y-2 rounded-lg border border-slate-200 p-4"
    >
      {customerId && <input type="hidden" name="customer_id" value={customerId} />}
      {leadId && <input type="hidden" name="lead_id" value={leadId} />}

      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          name="kind"
          defaultValue="note"
          aria-label="Kind"
          className={`${inputClass} sm:w-40`}
        >
          {ACTIVITY_KINDS.filter((k) => MANUAL_ACTIVITY_KINDS.includes(k.value)).map(
            (k) => (
              <option key={k.value} value={k.value}>
                {k.icon} {k.label}
              </option>
            )
          )}
        </select>
        <input
          name="subject"
          type="text"
          maxLength={300}
          placeholder="Title — e.g. Intro call, prices discussed"
          className={`${inputClass} flex-1`}
        />
      </div>
      <textarea
        name="body"
        rows={3}
        maxLength={5000}
        placeholder="Details (optional)"
        className={inputClass}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          name="date"
          type="date"
          aria-label="Date"
          className={`${inputClass} sm:w-40`}
        />
        <input
          name="time"
          type="time"
          aria-label="Time"
          className={`${inputClass} sm:w-32`}
        />
        <span className="text-xs text-slate-400">
          Leave the date empty for &quot;now&quot;.
        </span>
        <div className="flex gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
          >
            Close
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
          >
            {pending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
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
    </form>
  );
}
