"use client";

import { useActionState, useState } from "react";
import { MESSAGE_TYPES, TONES } from "@/lib/ai";
import { generateMessage, type GenerateState } from "./actions";

const initialState: GenerateState = {};

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default function MessageGenerator({
  customers,
}: {
  customers: { id: string; name: string; company: string | null }[];
}) {
  const [state, formAction, pending] = useActionState(
    generateMessage,
    initialState
  );
  const [copied, setCopied] = useState(false);

  async function copyMessage() {
    if (!state.message) return;
    await navigator.clipboard.writeText(state.message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <form
        action={formAction}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-slate-800">
          What do you need?
        </h2>

        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="message_type"
              className="block text-sm font-medium text-slate-700"
            >
              Message type
            </label>
            <select
              id="message_type"
              name="message_type"
              defaultValue="follow_up"
              className={inputClass}
            >
              {MESSAGE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="tone"
              className="block text-sm font-medium text-slate-700"
            >
              Tone
            </label>
            <select
              id="tone"
              name="tone"
              defaultValue="professional"
              className={inputClass}
            >
              {TONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="customer_id"
              className="block text-sm font-medium text-slate-700"
            >
              For customer <span className="text-slate-400">(optional)</span>
            </label>
            <select
              id="customer_id"
              name="customer_id"
              defaultValue=""
              className={inputClass}
            >
              <option value="">No specific customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.company ? ` (${c.company})` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">
              Picking a customer lets the AI use their name and your notes
              about them.
            </p>
          </div>

          <div>
            <label
              htmlFor="details"
              className="block text-sm font-medium text-slate-700"
            >
              Extra details <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              id="details"
              name="details"
              rows={3}
              placeholder="e.g. Invoice #12 for $500 is 2 weeks overdue"
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
          >
            {pending ? "Writing..." : "✨ Generate message"}
          </button>

          {state.error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          )}
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Your message</h2>
          {state.message && (
            <button
              type="button"
              onClick={copyMessage}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          )}
        </div>

        {pending ? (
          <div className="mt-4 space-y-2">
            <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
          </div>
        ) : state.message ? (
          <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-700">
            {state.message}
          </pre>
        ) : (
          <p className="mt-4 text-sm text-slate-400">
            Your generated message will appear here. Fill in the form and hit
            Generate.
          </p>
        )}
      </div>
    </div>
  );
}
