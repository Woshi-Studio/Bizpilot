"use client";

import { useActionState } from "react";
import type { Business } from "@/lib/types";
import { updateGoals, type GoalsFormState } from "./actions";

const initialState: GoalsFormState = {};

const inputClass =
  "mt-1 input";

export default function GoalsForm({ business }: { business: Business }) {
  const [state, formAction, pending] = useActionState(
    updateGoals,
    initialState
  );

  return (
    <form
      action={formAction}
      className="card p-6"
    >
      <h2 className="section-title">
        Business goals
      </h2>

      {state.error && (
        <p className="mt-3 alert-error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="mt-3 alert-success">
          {state.success}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">
            Target active customers
          </label>
          <input
            name="goal_customers"
            type="number"
            min="1"
            defaultValue={business.goal_customers ?? ""}
            placeholder="5"
            className={inputClass}
          />
        </div>
        <div>
          <label className="label">
            Target monthly revenue
          </label>
          <input
            name="goal_monthly_revenue"
            type="number"
            min="0"
            step="0.01"
            defaultValue={business.goal_monthly_revenue ?? ""}
            placeholder="3000"
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-5">
        <p className="text-sm font-medium text-slate-700">
          Long-term savings goal (optional)
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Anything you&apos;re saving toward — a house down payment, equipment,
          whatever it is for you.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">
              What&apos;s it for?
            </label>
            <input
              name="savings_goal_label"
              type="text"
              defaultValue={business.savings_goal_label ?? ""}
              placeholder="e.g. Real estate down payment"
              className={inputClass}
            />
          </div>
          <div>
            <label className="label">
              Current savings
            </label>
            <input
              name="savings_current"
              type="number"
              min="0"
              step="0.01"
              defaultValue={business.savings_current ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label className="label">
              Target
            </label>
            <input
              name="savings_target"
              type="number"
              min="0"
              step="0.01"
              defaultValue={business.savings_target ?? ""}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary"
        >
          {pending ? "Saving..." : "Save goals"}
        </button>
      </div>
    </form>
  );
}
