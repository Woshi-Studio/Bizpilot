"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ACTIVITY_KINDS, MANUAL_ACTIVITY_KINDS } from "@/lib/activities";
import { QUICK_ACTIVITIES } from "@/lib/templates";
import DateChips from "./date-chips";
import {
  addActivity,
  type ActivityFormState,
} from "@/app/(app)/activities/actions";

const initialState: ActivityFormState = {};

const inputClass =
  "input";

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
  const [kind, setKind] = useState("note");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [followDays, setFollowDays] = useState(0);

  // Clear the controlled fields when a save succeeds (during render, not
  // in an effect).
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.success) {
      setKind("note");
      setSubject("");
      setDate("");
      setTime("");
      setFollowDays(0);
    }
  }
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
      <input type="hidden" name="followup_days" value={followDays} />

      <div className="flex flex-wrap gap-1.5">
        {QUICK_ACTIVITIES.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => {
              setKind(q.kind);
              setSubject(q.subject);
              setFollowDays(q.followUpDays ?? 0);
            }}
            className="chip text-xs"
          >
            {q.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
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
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
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
      {followDays > 0 && (
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" checked onChange={() => setFollowDays(0)} className="h-3.5 w-3.5" />
          Also add a follow-up in {followDays} days
        </label>
      )}
      <DateChips
        withTime
        onPick={(d, t) => {
          setDate(d);
          setTime(t ?? "");
        }}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          name="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date"
          className={`${inputClass} sm:w-40`}
        />
        <input
          name="time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Time"
          className={`${inputClass} sm:w-32`}
        />
        <span className="text-xs text-slate-400">
          Empty = now.
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
            className="btn-primary"
          >
            {pending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
      {state.error && (
        <p className="alert-error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="alert-success">
          {state.success}
        </p>
      )}
    </form>
  );
}
