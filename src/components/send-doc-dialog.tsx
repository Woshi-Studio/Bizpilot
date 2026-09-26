"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Icon from "./icons";
import { mailtoHref } from "@/lib/mailto";
import {
  getShareLink,
  sendDocumentEmail,
  sendInvoiceEmail,
  type SendDocState,
  type ShareKind,
} from "@/app/(app)/share/actions";
import { setInvoiceStatus } from "@/app/(app)/invoices/actions";
import TemplateChips from "./template-chips";
import type { TemplateVars } from "@/lib/templates";

const initial: SendDocState = {};

export type SendDocProps = {
  kind: ShareKind;
  id: string;
  title: string; // "Invoice INV-0001" / "contract.pdf"
  to: { name: string; email: string | null } | null;
  subject: string;
  body: string; // "{link}" is replaced by the view link
  canSend: boolean;
  sendNote?: string;
  status?: string; // invoice status
  vars?: TemplateVars; // for the quick templates
};

// Send an invoice / quote / file: in-app (with the file attached) when the
// plan allows, or "Open in my email" (a view link, since email apps can't
// attach files from a link). Invoices sent the second way are marked Sent
// only when the user says so.
export function SendDocDialog({ open, onClose, ...p }: SendDocProps & { open: boolean; onClose: () => void }) {
  const [state, action, pending] = useActionState(
    p.kind === "invoice" ? sendInvoiceEmail : sendDocumentEmail,
    initial
  );
  const ref = useRef<HTMLDialogElement>(null);
  const [link, setLink] = useState<string | null>(null);
  const [linkError, setLinkError] = useState("");
  const [subject, setSubject] = useState(p.subject);
  const [body, setBody] = useState(p.body.replace("{link}", "…"));
  const [loading, startLoading] = useTransition();
  const [marked, setMarked] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    startLoading(async () => {
      const res = await getShareLink(p.kind, p.id);
      if ("url" in res && res.url) {
        setLink(res.url);
        setBody(p.body.replace("{link}", res.url));
      } else {
        setLinkError(("error" in res && res.error) || "Couldn't make a view link.");
        setBody(p.body.replace(/\n?[^\n]*\{link\}[^\n]*\n?/, "\n"));
      }
    });
  }, [open, p.kind, p.id, p.body]);

  const hasEmail = !!p.to?.email;
  const sent = !!state.success;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(38rem,calc(100vw-2rem))] rounded-[var(--radius-card)] bg-surface p-0 text-ink shadow-pop backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <form action={action} className="flex flex-col">
        <input type="hidden" name="id" value={p.id} />
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="section-title flex items-center gap-2">
            <Icon name="send" className="h-4 w-4 text-accent" />
            Send {p.title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-surface-3 hover:text-ink">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <span className="label">To</span>
            <p className="mt-1 rounded-[var(--radius-control)] bg-surface-2 px-3.5 py-2.5 text-sm text-ink-2">
              {p.to ? (
                <>
                  <span className="font-medium text-ink">{p.to.name}</span>{" "}
                  {hasEmail ? `<${p.to.email}>` : "— no email on file (add one on their page)"}
                </>
              ) : (
                "No customer on this one — pick a customer first"
              )}
            </p>
          </div>
          <TemplateChips
            only={
              p.kind === "invoice"
                ? ["invoice_attached", "quote_attached", "reminder_friendly", "reminder_firm", "follow_up"]
                : ["follow_up", "quote_attached", "invoice_attached", "job_finished", "welcome"]
            }
            vars={{ first_name: p.to?.name.split(" ")[0], name: p.to?.name, ...p.vars, link: link ?? undefined }}
            onPick={(s, b) => {
              setSubject(s);
              setBody(b);
            }}
          />
          <div>
            <label htmlFor={`sd-subject-${p.id}`} className="label">Subject</label>
            <input
              id={`sd-subject-${p.id}`}
              name="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              required
              className="input mt-1"
            />
          </div>
          <div>
            <label htmlFor={`sd-body-${p.id}`} className="label">Message</label>
            <textarea
              id={`sd-body-${p.id}`}
              name="body"
              rows={9}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              className="input mt-1 leading-6"
            />
          </div>
          <p className="text-xs text-muted">
            {loading
              ? "Making a view link…"
              : link
                ? p.canSend
                  ? p.kind === "invoice"
                    ? "Sent from Jephelen with a copy attached (opens in any browser, prints to PDF) and the view link."
                    : "Sent from Jephelen with the file attached."
                  : "Open in my email puts the view link in the message — email apps can't attach a file from a link."
                : linkError}
          </p>

          {state.error && <p className="alert-error">{state.error}</p>}
          {state.success && <p className="alert-success">{state.success}</p>}
          {!p.canSend && p.sendNote && <p className="alert-info text-xs">{p.sendNote}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2 px-5 py-3.5">
          <div className="flex flex-wrap gap-2">
            <a
              href={mailtoHref(p.to?.email, subject, body)}
              aria-disabled={!link}
              className={`btn-secondary btn-sm ${!link ? "pointer-events-none opacity-50" : ""}`}
            >
              <Icon name="mail" className="h-4 w-4" />
              Open in my email
            </a>
            {p.kind === "invoice" && !p.canSend && p.status === "draft" && (
              <button
                type="button"
                disabled={marked}
                onClick={async () => {
                  const fd = new FormData();
                  fd.set("id", p.id);
                  fd.set("status", "sent");
                  await setInvoiceStatus(fd);
                  setMarked(true);
                }}
                className="btn-ghost btn-sm"
              >
                <Icon name="check" className="h-4 w-4" />
                {marked ? "Marked as sent" : "Mark as sent"}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost btn-sm">
              {sent || marked ? "Done" : "Cancel"}
            </button>
            {p.canSend && (
              <button type="submit" disabled={pending || !hasEmail || sent || loading} className="btn-primary btn-sm">
                <Icon name="send" className="h-4 w-4" />
                {pending ? "Sending…" : sent ? "Sent" : "Send"}
              </button>
            )}
          </div>
        </div>
      </form>
    </dialog>
  );
}

// A button that opens the dialog.
export default function SendDocButton({
  label = "Send by email",
  className = "btn-primary",
  ...p
}: SendDocProps & { label?: string; className?: string }) {
  const [n, setN] = useState(0);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setN((x) => x + 1);
          setOpen(true);
        }}
        className={className}
      >
        <Icon name="send" className="h-4 w-4" />
        {label}
      </button>
      {open && <SendDocDialog key={n} open onClose={() => setOpen(false)} {...p} />}
    </>
  );
}
