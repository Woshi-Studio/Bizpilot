"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import type { PaymentMethod } from "@/lib/types";
import { addPaymentMethod, deletePaymentMethod, type SettingsState } from "./actions";

const initialState: SettingsState = {};

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

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
      className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
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

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">
        💳 Payment methods
      </h2>
      <p className="mt-1 text-sm text-slate-500">
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
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <select name="label" defaultValue="PayPal" className={inputClass}>
            <option value="PayPal">PayPal</option>
            <option value="E-Transfer">E-Transfer</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Custom">Custom</option>
          </select>
          <input
            name="value"
            type="text"
            required
            placeholder="paypal.me/you, email, account details..."
            className={`${inputClass} sm:col-span-2`}
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
          >
            {pending ? "Saving..." : "Add payment method"}
          </button>
        </div>
      </form>
    </div>
  );
}
