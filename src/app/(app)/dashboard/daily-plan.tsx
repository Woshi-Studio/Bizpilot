"use client";

import { useActionState } from "react";
import { generateDailyPlan, type PlanState } from "./actions";

const initialState: PlanState = {};

export default function DailyPlan() {
  const [state, formAction, pending] = useActionState(
    generateDailyPlan,
    initialState
  );

  return (
    <div className="card relative overflow-hidden p-5 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-gradient-to-br from-indigo-500/25 to-violet-500/10 blur-2xl" />
      <div className="relative flex items-center justify-between gap-3">
        <h2 className="section-title">
          <span className="mr-1.5 text-accent">✦</span>Today&apos;s plan
        </h2>
        <form action={formAction}>
          <button
            type="submit"
            disabled={pending}
            className="btn-primary btn-sm"
          >
            {pending
              ? "Thinking..."
              : state.plan
                ? "Refresh plan"
                : "Get my plan"}
          </button>
        </form>
      </div>

      {pending ? (
        <div className="mt-4 space-y-2">
          <div className="h-3 w-3/4 animate-pulse rounded bg-surface-3" />
          <div className="h-3 w-full animate-pulse rounded bg-surface-3" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-surface-3" />
        </div>
      ) : state.error ? (
        <p className="mt-3 alert-error">
          {state.error}
        </p>
      ) : state.plan ? (
        <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-700">
          {state.plan}
        </pre>
      ) : (
        <p className="relative mt-3 text-sm leading-6 text-slate-500">
          Let the AI look at your tasks and follow-ups, and suggest what to
          tackle first today.
        </p>
      )}
    </div>
  );
}
