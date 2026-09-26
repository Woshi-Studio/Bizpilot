"use client";

import { useActionState, useRef, useEffect } from "react";
import { LEAD_CHANNELS } from "@/lib/types";
import { logOutreach, type OutreachFormState } from "./actions";
import BusinessLineInput from "@/components/business-line-input";
import FormError from "@/components/form-error";
import DateChips, { setInputValue } from "@/components/date-chips";

const initialState: OutreachFormState = {};

const inputClass =
  "mt-1 input";

export default function OutreachForm({
  lines,
  defaultLine,
}: {
  lines?: string[];
  defaultLine?: string;
}) {
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
      className="card p-6"
    >
      <h2 className="section-title">
        Log outreach you sent
      </h2>
      <p className="mt-1 text-xs text-slate-400">
        A cold email, Upwork proposal, LinkedIn message — anything you
        initiated. The public page already logs inbound leads for you.
      </p>

      <FormError error={state.error} upgrade={state.upgrade} className="mt-3" />
      {state.success && (
        <p className="mt-3 alert-success">
          {state.success}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label">
            Prospect / company *
          </label>
          <input name="name" type="text" required className={inputClass} />
        </div>
        <div>
          <label className="label">
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
          <label className="label">
            Follow-up date
          </label>
          <input id="outreach_follow_up" name="follow_up_date" type="date" className={inputClass} />
          <DateChips className="mt-1.5" onPick={(d) => setInputValue("outreach_follow_up", d)} />
        </div>
        <div>
          <label className="label">
            Email
          </label>
          <input name="email" type="email" className={inputClass} />
        </div>
        <BusinessLineInput
          id="outreach_business_line"
          lines={lines}
          defaultValue={defaultLine}
          className={inputClass}
        />
        <div className="sm:col-span-3">
          <label className="label">
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
          className="btn-primary"
        >
          {pending ? "Saving..." : "Log outreach"}
        </button>
      </div>
    </form>
  );
}
