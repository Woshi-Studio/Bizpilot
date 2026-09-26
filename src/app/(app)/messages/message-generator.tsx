"use client";

import { useActionState, useState } from "react";
import { MESSAGE_TYPES, TONES } from "@/lib/ai-options";
import { generateMessage, type GenerateState } from "./actions";
import Icon from "@/components/icons";
import SendEmailDialog, { type EmailContact } from "@/components/send-email-dialog";
import { mailtoHref } from "@/lib/mailto";
import TemplateChips from "@/components/template-chips";

const initialState: GenerateState = {};

const inputClass = "mt-1 input";

type ContactOption = {
  kind: "customer" | "lead";
  id: string;
  name: string;
  company: string | null;
  email: string | null;
};

// Same rule as splitSubject() in lib/email.ts (kept here so this client
// file doesn't import server code).
function splitSubject(text: string) {
  const m = text.match(/^\s*subject\s*:\s*(.+)\r?\n+([\s\S]*)$/i);
  if (m) return { subject: m[1].trim().slice(0, 200), body: m[2].trim() };
  return { subject: "", body: text.trim() };
}

export default function MessageGenerator({
  contacts,
  prefillContact,
  prefillDetails,
  canSend,
  sendNote,
  businessName,
}: {
  contacts: ContactOption[];
  prefillContact?: string;
  prefillDetails?: string;
  canSend: boolean;
  sendNote: string;
  businessName?: string;
}) {
  const [state, formAction, pending] = useActionState(generateMessage, initialState);
  const [copied, setCopied] = useState(false);
  const [contactKey, setContactKey] = useState(prefillContact ?? "");
  const [dialogN, setDialogN] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);

  const selected = contacts.find((c) => `${c.kind}:${c.id}` === contactKey) ?? null;
  const emailContact: EmailContact | null = selected
    ? { kind: selected.kind, id: selected.id, name: selected.name, email: selected.email }
    : null;
  // A quick template (free) replaces the AI draft until the next Generate.
  const [manual, setManual] = useState<{ subject: string; body: string; forState: unknown } | null>(null);
  const showManual = manual && manual.forState === state;
  const draft = showManual
    ? { subject: manual.subject, body: manual.body }
    : state.message
      ? splitSubject(state.message)
      : null;
  const message = draft
    ? draft.subject
      ? `Subject: ${draft.subject}\n\n${draft.body}`
      : draft.body
    : "";

  async function copyMessage() {
    if (!message) return;
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const customers = contacts.filter((c) => c.kind === "customer");
  const leads = contacts.filter((c) => c.kind === "lead");

  let sendHint = "";
  if (!canSend) sendHint = sendNote;
  else if (!selected) sendHint = "Pick a customer or lead to send it to them.";
  else if (!selected.email) sendHint = `${selected.name} has no email on file.`;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      <form action={formAction} className="card p-5 sm:p-6 lg:col-span-2">
        <TemplateChips
          className="mb-5 border-b border-line/70 pb-4"
          vars={{ first_name: selected?.name.split(" ")[0], name: selected?.name, business: businessName }}
          onPick={(subject, body) => setManual({ subject, body, forState: state })}
        />
        <h2 className="section-title">What do you need?</h2>

        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="message_type" className="label">Type</label>
              <select id="message_type" name="message_type" defaultValue="follow_up" className={inputClass}>
                {MESSAGE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tone" className="label">Tone</label>
              <select id="tone" name="tone" defaultValue="professional" className={inputClass}>
                {TONES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="contact" className="label">
              To <span className="font-normal text-subtle">(optional)</span>
            </label>
            <select
              id="contact"
              name="contact"
              value={contactKey}
              onChange={(e) => setContactKey(e.target.value)}
              className={inputClass}
            >
              <option value="">No one in particular</option>
              {customers.length > 0 && (
                <optgroup label="Customers">
                  {customers.map((c) => (
                    <option key={c.id} value={`customer:${c.id}`}>
                      {c.name}
                      {c.company ? ` (${c.company})` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
              {leads.length > 0 && (
                <optgroup label="Leads">
                  {leads.map((c) => (
                    <option key={c.id} value={`lead:${c.id}`}>
                      {c.name}
                      {c.company ? ` (${c.company})` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <p className="mt-1.5 text-xs text-muted">
              Picking someone lets the AI use their name and your notes about them.
            </p>
          </div>

          <div>
            <label htmlFor="details" className="label">
              Extra details <span className="font-normal text-subtle">(optional)</span>
            </label>
            <textarea
              id="details"
              name="details"
              rows={prefillDetails ? 5 : 3}
              defaultValue={prefillDetails ?? ""}
              placeholder="e.g. Invoice #12 for $500 is 2 weeks overdue"
              className={inputClass}
            />
          </div>

          <button type="submit" disabled={pending} className="btn-primary w-full">
            <Icon name="sparkle" className="h-4 w-4" />
            {pending ? "Writing…" : "Generate message"}
          </button>

          {state.error && <p className="alert-error">{state.error}</p>}
        </div>
      </form>

      <div className="card flex flex-col p-5 sm:p-6 lg:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Your message</h2>
          {message && (
            <div className="flex gap-2">
              <button type="button" onClick={copyMessage} className="btn-secondary btn-sm">
                <Icon name="copy" className="h-4 w-4" />
                {copied ? "Copied!" : "Copy"}
              </button>
              {draft && (
                <a
                  href={mailtoHref(selected?.email, draft.subject, draft.body)}
                  className="btn-secondary btn-sm"
                  title={
                    selected?.email
                      ? `Opens your own email app, addressed to ${selected.name}`
                      : "Opens your own email app with this message"
                  }
                >
                  <Icon name="mail" className="h-4 w-4" />
                  Open in my email
                </a>
              )}
              {canSend && (
                <button
                  type="button"
                  onClick={() => {
                    setDialogN((n) => n + 1);
                    setDialogOpen(true);
                  }}
                  disabled={!selected?.email}
                  title={sendHint || `Send to ${selected?.name}`}
                  className="btn-primary btn-sm"
                >
                  <Icon name="send" className="h-4 w-4" />
                  Send
                </button>
              )}
            </div>
          )}
        </div>

        {pending ? (
          <div className="mt-5 space-y-2.5">
            <div className="h-3 w-3/4 animate-pulse rounded bg-surface-3" />
            <div className="h-3 w-full animate-pulse rounded bg-surface-3" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-surface-3" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-surface-3" />
          </div>
        ) : draft ? (
          <div className="mt-5 flex-1 rounded-2xl bg-surface-2 p-4 sm:p-5">
            {draft.subject && (
              <p className="border-b border-line/70 pb-3 text-sm">
                <span className="text-muted">Subject: </span>
                <span className="font-semibold text-ink">{draft.subject}</span>
              </p>
            )}
            <pre className={`whitespace-pre-wrap font-sans text-sm leading-6 text-ink-2 ${draft.subject ? "pt-3" : ""}`}>
              {draft.body}
            </pre>
          </div>
        ) : (
          <div className="mt-5 flex flex-1 flex-col items-center justify-center rounded-2xl bg-surface-2 px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-text">
              <Icon name="sparkle" className="h-6 w-6" />
            </span>
            <p className="mt-4 text-sm font-medium text-ink">Your draft shows up here</p>
            <p className="mt-1 max-w-xs text-sm text-muted">
              Pick a type and tone, then press Generate. You can copy it or send it straight away.
            </p>
          </div>
        )}

        {message && sendHint && (
          <p className="mt-3 text-xs text-muted">{sendHint}</p>
        )}
      </div>

      {dialogOpen && draft && (
        <SendEmailDialog
          key={dialogN}
          open
          onClose={() => setDialogOpen(false)}
          contact={emailContact}
          subject={draft.subject}
          body={draft.body}
        />
      )}
    </div>
  );
}
