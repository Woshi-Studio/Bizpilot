"use client";

import Link from "next/link";
import { useState } from "react";
import Icon, { type IconName } from "@/components/icons";
import SendEmailDialog from "@/components/send-email-dialog";
import { SendDocDialog } from "@/components/send-doc-dialog";
import type { TemplateVars } from "@/lib/templates";

// An unsent invoice / quote the "Send invoice" menu offers.
export type SendableDoc = {
  id: string;
  title: string; // "Invoice INV-0003 · CA$226.00"
  subject: string;
  body: string; // with {link}
  status: string;
  vars?: TemplateVars;
};

export type OpenInvoice = {
  id: string;
  number: string;
  total: string; // already formatted
  due: string | null;
};

type Action =
  | { key: string; label: string; icon: IconName; href: string; primary?: boolean; title?: string }
  | { key: string; label: string; icon: IconName; onClick: () => void; primary?: boolean; disabled?: boolean; title?: string };

// The sticky action bar on a contact page: every common action one tap away.
export default function ContactActions({
  kind,
  id,
  name,
  email,
  canSend,
  sendNote,
  openInvoice,
  sendDocs = [],
  businessName,
  leadConvert,
}: {
  kind: "customer" | "lead";
  id: string;
  name: string;
  email: string | null;
  canSend: boolean;
  sendNote?: string;
  openInvoice?: OpenInvoice | null;
  sendDocs?: SendableDoc[];
  businessName: string;
  // for leads: a server action form that turns the lead into a customer
  leadConvert?: React.ReactNode;
}) {
  const [dialog, setDialog] = useState<{ n: number; subject: string; body: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sending, setSending] = useState<{ n: number; doc: SendableDoc } | null>(null);
  const contactParam = `${kind}=${id}`;

  function compose(subject = "", body = "") {
    setDialog((d) => ({ n: (d?.n ?? 0) + 1, subject, body }));
  }

  const actions: Action[] = [];

  if (kind === "customer") {
    actions.push({ key: "invoice", label: "Add invoice", icon: "receipt", href: `/invoices/new?customer=${id}` });
    if (sendDocs.length === 0 && openInvoice) {
      actions.push({
        key: "send-invoice",
        label: "Send invoice",
        icon: "send",
        href: `/invoices/${openInvoice.id}`,
        title: "Open the invoice to send, print or share it",
      });
    }
  }

  if (email) {
    actions.push(
      canSend
        ? { key: "email", label: "Send email", icon: "mail", onClick: () => compose(), primary: true }
        : {
            key: "email",
            label: "Send email",
            icon: "mail",
            href: `mailto:${email}`,
            primary: true,
            title: sendNote,
          }
    );
  }

  actions.push({
    key: "ai",
    label: "Write message (AI)",
    icon: "sparkle",
    href: `/messages?contact=${kind}:${id}`,
  });
  actions.push({
    key: "meeting",
    label: "Book meeting",
    icon: "calendar",
    href: `/calendar?view=week&${contactParam}#book`,
  });
  if (kind === "customer") {
    actions.push({
      key: "referral",
      label: "Ask for referral",
      icon: "people",
      href: `/messages?contact=customer:${id}&details=${encodeURIComponent(
        "Write a warm, short message asking this customer if they know anyone else who could use my services — a friendly referral ask, not pushy. Mention I'd love to return the favor."
      )}`,
    });
    actions.push({ key: "task", label: "Add task", icon: "check", href: `/tasks?customer=${id}` });
    actions.push({ key: "upload", label: "Upload file", icon: "upload", href: "#documents" });
  }
  actions.push({ key: "edit", label: "Edit details", icon: "edit", href: "#edit" });

  return (
    <>
      <div data-tour="contact-actions" className="sticky top-16 z-20 -mx-4 bg-canvas/85 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:px-0 print:hidden">
        <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
          {leadConvert}
          {sendDocs.length > 0 && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
                className="btn-secondary btn-sm"
              >
                <Icon name="send" className="h-4 w-4" />
                Send invoice
                <span className="rounded-full bg-accent-soft px-1.5 text-[10px] font-bold text-accent-text">
                  {sendDocs.length}
                </span>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="card absolute left-0 top-10 z-50 w-72 p-1.5 shadow-pop">
                    <p className="px-2.5 py-1.5 text-xs text-muted">Not sent yet</p>
                    {sendDocs.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setSending((s) => ({ n: (s?.n ?? 0) + 1, doc: d }));
                        }}
                        className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-ink-2 hover:bg-surface-3 hover:text-ink"
                      >
                        {d.title}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {[...actions].sort((a, b) => Number(!!b.primary) - Number(!!a.primary)).map((a) => {
            const cls = `${a.primary ? "btn-primary" : "btn-secondary"} btn-sm shrink-0`;
            const inner = (
              <>
                <Icon name={a.icon} className="h-4 w-4" />
                {a.label}
              </>
            );
            if ("href" in a && /^(mailto:|#)/.test(a.href)) {
              return (
                <a key={a.key} href={a.href} className={cls} title={a.title}>
                  {inner}
                </a>
              );
            }
            return "href" in a ? (
              <Link key={a.key} href={a.href} className={cls} title={a.title}>
                {inner}
              </Link>
            ) : (
              <button key={a.key} type="button" onClick={a.onClick} className={cls} title={a.title}>
                {inner}
              </button>
            );
          })}
        </div>
        {!canSend && email && sendNote && (
          <p className="mt-1.5 text-xs text-muted">{sendNote}</p>
        )}
      </div>

      {sending && (
        <SendDocDialog
          key={sending.n}
          open
          onClose={() => setSending(null)}
          kind="invoice"
          id={sending.doc.id}
          title={sending.doc.title.split(" · ")[0]}
          to={{ name, email }}
          subject={sending.doc.subject}
          body={sending.doc.body}
          canSend={canSend}
          sendNote={sendNote}
          status={sending.doc.status}
          vars={sending.doc.vars}
        />
      )}
      {dialog && (
        <SendEmailDialog
          key={dialog.n}
          open
          onClose={() => setDialog(null)}
          contact={{ kind, id, name, email }}
          subject={dialog.subject}
          body={dialog.body}
          vars={{ business: businessName }}
        />
      )}
    </>
  );
}
