"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendEmail, type SendEmailState } from "@/app/(app)/email/actions";
import Icon from "./icons";
import { mailtoHref } from "@/lib/mailto";

const initial: SendEmailState = {};

export type EmailContact = {
  kind: "customer" | "lead";
  id: string;
  name: string;
  email: string | null;
};

// A small "compose" dialog. The recipient is fixed (one of the
// business's own contacts); the server re-checks everything.
export default function SendEmailDialog({
  open,
  onClose,
  contact,
  subject: subject0 = "",
  body: body0 = "",
}: {
  open: boolean;
  onClose: () => void;
  contact: EmailContact | null;
  subject?: string;
  body?: string;
}) {
  const [state, action, pending] = useActionState(sendEmail, initial);
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Same message, opened in the user's own email app instead.
  function openInMyEmail() {
    const f = formRef.current;
    const subject = String((f?.elements.namedItem("subject") as HTMLInputElement | null)?.value ?? subject0);
    const text = String((f?.elements.namedItem("body") as HTMLTextAreaElement | null)?.value ?? body0);
    window.location.href = mailtoHref(contact?.email, subject, text);
  }

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const hasEmail = !!contact?.email;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-[var(--radius-card)] bg-surface p-0 text-ink shadow-pop backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <form ref={formRef} action={action} className="flex flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="section-title flex items-center gap-2">
            <Icon name="send" className="h-4 w-4 text-accent" />
            Send email
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted hover:bg-surface-3 hover:text-ink"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <input type="hidden" name="contact" value={contact ? `${contact.kind}:${contact.id}` : ""} />
          <div>
            <span className="label">To</span>
            <p className="mt-1 rounded-[var(--radius-control)] bg-surface-2 px-3.5 py-2.5 text-sm text-ink-2">
              {contact ? (
                <>
                  <span className="font-medium text-ink">{contact.name}</span>{" "}
                  {hasEmail ? `<${contact.email}>` : "— no email on file"}
                </>
              ) : (
                "Pick a customer first"
              )}
            </p>
          </div>
          <div>
            <label htmlFor="email_subject" className="label">Subject</label>
            <input
              key={`s-${subject0}`}
              id="email_subject"
              name="subject"
              defaultValue={subject0}
              maxLength={200}
              required
              className="input mt-1"
            />
          </div>
          <div>
            <label htmlFor="email_body" className="label">Message</label>
            <textarea
              key={`b-${body0.length}-${body0.slice(0, 20)}`}
              id="email_body"
              name="body"
              rows={9}
              defaultValue={body0}
              required
              className="input mt-1 leading-6"
            />
          </div>

          {state.error && <p className="alert-error">{state.error}</p>}
          {state.success && <p className="alert-success">{state.success}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-2 px-5 py-3.5">
          <button
            type="button"
            onClick={openInMyEmail}
            disabled={!hasEmail}
            className="btn-ghost btn-sm"
            title="Open this in your own email app instead"
          >
            <Icon name="mail" className="h-4 w-4" />
            Open in my email
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">
              {state.success ? "Done" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={pending || !hasEmail || !!state.success}
              className="btn-primary"
            >
              <Icon name="send" className="h-4 w-4" />
              {pending ? "Sending…" : state.success ? "Sent" : "Send"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
