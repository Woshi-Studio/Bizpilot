"use client";

import { useActionState } from "react";
import FormError from "@/components/form-error";
import { LEAD_ALERT_MODES, type LeadAlertMode } from "@/lib/lead-alerts";
import { saveLeadAlerts, type LeadAlertState } from "./lead-alert-actions";

const initial: LeadAlertState = {};

// Settings -> Lead alerts: Email + App / Email only / App only / Off.
export default function LeadAlertsSection({ mode, emailReady }: { mode: LeadAlertMode; emailReady: boolean }) {
  const [state, action, pending] = useActionState(saveLeadAlerts, initial);
  return (
    <section id="lead-alerts" className="card mt-8 scroll-mt-24 p-6">
      <h2 className="section-title">Lead alerts</h2>
      <p className="mt-1 text-sm text-muted">
        When we find new leads for you. The app shows a bell with the count; the email comes at most
        once a day.
      </p>
      <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Lead alerts</legend>
          {LEAD_ALERT_MODES.map((m) => (
            <label key={m.value} className="chip cursor-pointer has-[:checked]:border-accent has-[:checked]:text-ink">
              <input type="radio" name="lead_alerts" value={m.value} defaultChecked={m.value === mode} className="mr-1.5" />
              {m.label}
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={pending} className="btn-secondary btn-sm">
          {pending ? "Saving..." : "Save"}
        </button>
      </form>
      {state.success && <p className="mt-2 text-xs text-muted">{state.success}</p>}
      <FormError error={state.error} className="mt-2" />
      {!emailReady && (mode === "both" || mode === "email") && (
        <p className="mt-2 text-xs text-muted">Alert emails start once email sending is switched on. The bell works now.</p>
      )}
    </section>
  );
}
