"use client";

import { useActionState } from "react";
import { createPlan, upgradePlanWithAi, type LaunchpadState } from "./actions";

const initialState: LaunchpadState = {};

const inputClass =
  "mt-1 input";

export function LaunchpadIntake() {
  const [state, formAction, pending] = useActionState(
    createPlan,
    initialState
  );

  return (
    <form
      action={formAction}
      className="card p-6"
    >
      <h2 className="section-title">
        Answer 5 quick questions
      </h2>
      <p className="page-sub">
        You&apos;ll get a written business plan plus an 18-step roadmap loaded
        into your task list — from this week to one year out.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label
            htmlFor="idea"
            className="label"
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
              className="label"
            >
              Where? <span className="text-slate-400">(city/online)</span>
            </label>
            <input id="location" name="location" type="text" className={inputClass} />
          </div>
          <div>
            <label
              htmlFor="budget"
              className="label"
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
              className="label"
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
              className="label"
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
        <p className="mt-4 alert-error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="mt-4 alert-success">
          {state.success}
        </p>
      )}

      <div className="mt-5 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary"
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
        <p className="mt-2 alert-error">
          {state.error}
        </p>
      )}
    </div>
  );
}
