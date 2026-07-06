"use client";

import { useActionState } from "react";
import { createPlan, upgradePlanWithAi, type LaunchpadState } from "./actions";

const initialState: LaunchpadState = {};

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export function LaunchpadIntake() {
  const [state, formAction, pending] = useActionState(
    createPlan,
    initialState
  );

  return (
    <form
      action={formAction}
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-slate-800">
        Answer 5 quick questions
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        You&apos;ll get a written business plan plus an 18-step roadmap loaded
        into your task list — from this week to one year out.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label
            htmlFor="idea"
            className="block text-sm font-medium text-slate-700"
          >
            What&apos;s the business? *
          </label>
          <textarea
            id="idea"
            name="idea"
            rows={2}
            required
            placeholder="e.g. Cleaning service for small offices in my area"
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="location"
              className="block text-sm font-medium text-slate-700"
            >
              Where? <span className="text-slate-400">(city/online)</span>
            </label>
            <input id="location" name="location" type="text" className={inputClass} />
          </div>
          <div>
            <label
              htmlFor="budget"
              className="block text-sm font-medium text-slate-700"
            >
              Money you can invest{" "}
              <span className="text-slate-400">(roughly)</span>
            </label>
            <input
              id="budget"
              name="budget"
              type="text"
              placeholder="e.g. $500"
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="hours_per_week"
              className="block text-sm font-medium text-slate-700"
            >
              Hours per week you can give
            </label>
            <input
              id="hours_per_week"
              name="hours_per_week"
              type="text"
              placeholder="e.g. 15"
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="goal"
              className="block text-sm font-medium text-slate-700"
            >
              Goal for year one
            </label>
            <input
              id="goal"
              name="goal"
              type="text"
              placeholder="e.g. Replace my part-time job income"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {state.error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {state.success}
        </p>
      )}

      <div className="mt-5 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
        >
          {pending ? "Building your plan..." : "🚀 Build my plan & roadmap"}
        </button>
      </div>
    </form>
  );
}

export function AiUpgradeButton() {
  const [state, formAction, pending] = useActionState(
    upgradePlanWithAi,
    initialState
  );

  return (
    <div>
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
        >
          {pending ? "Personalizing..." : "✨ Personalize with AI"}
        </button>
      </form>
      {state.error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </div>
  );
}
