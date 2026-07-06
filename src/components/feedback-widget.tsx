"use client";

import { useActionState, useState } from "react";
import { usePathname } from "next/navigation";
import {
  submitFeedback,
  type FeedbackState,
} from "@/app/(app)/feedback-actions";

const initialState: FeedbackState = {};

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    submitFeedback,
    initialState
  );
  const pathname = usePathname();

  return (
    <div className="fixed bottom-4 right-4 z-50 print:hidden">
      {open && (
        <div className="mb-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">
              Something broken? An idea?
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close feedback"
              className="text-slate-400 hover:text-slate-600"
            >
              &times;
            </button>
          </div>

          {state.success ? (
            <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              {state.success}
            </p>
          ) : (
            <form action={formAction} className="mt-3">
              <input type="hidden" name="page" value={pathname} />
              <textarea
                name="message"
                rows={3}
                required
                placeholder="Tell us what happened or what you wish existed..."
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {state.error && (
                <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                  {state.error}
                </p>
              )}
              <button
                type="submit"
                disabled={pending}
                className="mt-2 w-full rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
              >
                {pending ? "Sending..." : "Send feedback"}
              </button>
            </form>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="ml-auto block rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm hover:border-indigo-400 hover:text-indigo-600"
      >
        💬 Feedback
      </button>
    </div>
  );
}
