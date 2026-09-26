"use client";

import { useActionState, useState } from "react";
import { usePathname } from "next/navigation";
import Icon from "./icons";
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
    <div className="relative print:hidden">
      {open && (
        <div className="card absolute right-0 top-12 z-50 w-72 p-4 shadow-pop">
          <div className="flex items-center justify-between">
            <h3 className="section-title">
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
            <p className="mt-3 alert-success">
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
                className="input"
              />
              {state.error && (
                <p className="mt-2 alert-error">
                  {state.error}
                </p>
              )}
              <button
                type="submit"
                disabled={pending}
                className="mt-2 w-full btn-primary"
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
        aria-label="Send feedback"
        title="Feedback"
        className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-3 hover:text-ink"
      >
        <Icon name="chat" className="h-5 w-5" />
        <span className="hidden sm:inline">Feedback</span>
      </button>
    </div>
  );
}
