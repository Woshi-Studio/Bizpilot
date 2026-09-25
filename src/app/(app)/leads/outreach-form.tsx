"use client";

import { useActionState, useRef, useEffect } from "react";
import { LEAD_CHANNELS } from "@/lib/types";
import { logOutreach, type OutreachFormState } from "./actions";

const initialState: OutreachFormState = {};

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default function OutreachForm() {
  const [state, formAction, pending] = useActionState(
    logOutreach,
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
      <h2 className="text-sm font-semibold text-slate-800">
        Log outreach you sent
      </h2>
      <p className="mt-1 text-xs text-slate-400">
        A cold email, Upwork proposal, LinkedIn message — anything you
        initiated. The public page already logs inbound leads for you.
      </p>

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

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Prospect / company *
          </label>
          <input name="name" type="text" required className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Channel
          </label>
          <select name="channel" defaultValue="email" className={inputClass}>
            {LEAD_CHANNELS.filter((c) => c.value !== "inbound").map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Follow-up date
          </label>
          <input name="follow_up_date" type="date" className={inputClass} />
        </div>
        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-slate-700">
            Notes
          </label>
          <input
            name="message"
            type="text"
            placeholder="What was said, next steps..."
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
          {pending ? "Saving..." : "Log outreach"}
        </button>
      </div>
    </form>
  );
}
