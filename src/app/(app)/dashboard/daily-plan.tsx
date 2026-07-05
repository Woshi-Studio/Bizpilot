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
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">
          ✨ Today&apos;s Plan
        </h2>
        <form action={formAction}>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
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
          <div className="h-3 w-3/4 animate-pulse rounded bg-indigo-100" />
          <div className="h-3 w-full animate-pulse rounded bg-indigo-100" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-indigo-100" />
        </div>
      ) : state.error ? (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : state.plan ? (
        <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-700">
          {state.plan}
        </pre>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          Let the AI look at your tasks and follow-ups, and suggest what to
          tackle first today.
        </p>
      )}
    </div>
  );
}
