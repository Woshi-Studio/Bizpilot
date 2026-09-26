"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import type { PaymentMethod } from "@/lib/types";
import { addPaymentMethod, deletePaymentMethod, type SettingsState } from "./actions";

const initialState: SettingsState = {};

// What customers can pick from on an invoice. The text shows on the
// invoice under "How to pay".
const PRESETS = [
  { label: "Interac e-Transfer", hint: "Send to: you@example.com (auto-deposit on)" },
  { label: "Bank transfer / EFT", hint: "Bank, transit, institution and account number" },
  { label: "PayPal", hint: "paypal.me/yourname or your PayPal email" },
  { label: "Zelle", hint: "Your Zelle email or phone" },
  { label: "Cash / cheque", hint: "Payable to …" },
  { label: "Other", hint: "How to pay you" },
];

const inputClass =
  "mt-1 input";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-xs link"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export default function PaymentMethodsForm({
  methods,
}: {
  methods: PaymentMethod[];
}) {
  const [state, formAction, pending] = useActionState(
    addPaymentMethod,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState(PRESETS[0].label);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <div className="card p-6">
      <h2 className="section-title">
        💳 Payment methods
      </h2>
      <p className="page-sub">
        No payment processing here — just your own PayPal link, e-transfer
        email, bank details, or anything else you want to show customers and
        attach to invoices.
      </p>

      {methods.length > 0 && (
        <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-100">
          {methods.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {m.label}
                </p>
                <p className="truncate text-sm text-slate-800">{m.value}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <CopyButton text={m.value} />
                <form action={deletePaymentMethod}>
                  <input type="hidden" name="id" value={m.id} />
                  <button
                    type="submit"
                    className="text-xs font-medium text-slate-400 hover:text-red-600"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <form ref={formRef} action={formAction} className="mt-4 space-y-3">
        {state.error && (
          <p className="alert-error">
            {state.error}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <select
            name="label"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={inputClass}
          >
            {PRESETS.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            name="value"
            type="text"
            required
            placeholder={PRESETS.find((p) => p.label === kind)?.hint ?? "Details"}
            className={`${inputClass} sm:col-span-2`}
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="btn-primary"
          >
            {pending ? "Saving..." : "Add payment method"}
          </button>
        </div>
      </form>
    </div>
  );
}
