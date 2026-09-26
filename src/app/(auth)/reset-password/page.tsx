"use client";

import { useActionState } from "react";
import { resetPassword, type AuthState } from "../actions";

const initialState: AuthState = {};

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(
    resetPassword,
    initialState
  );

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900">
        Choose a new password
      </h2>
      <p className="page-sub">
        Enter a new password for your account.
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        {state.error && (
          <p className="alert-error">
            {state.error}
          </p>
        )}
        <div>
          <label
            htmlFor="password"
            className="label"
          >
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="mt-1 input"
          />
        </div>
        <div>
          <label
            htmlFor="confirm_password"
            className="label"
          >
            Confirm new password
          </label>
          <input
            id="confirm_password"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="mt-1 input"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full btn-primary"
        >
          {pending ? "Updating..." : "Update password"}
        </button>
      </form>
    </div>
  );
}
