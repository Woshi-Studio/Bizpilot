"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPassword, type AuthState } from "../actions";

const initialState: AuthState = {};

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(
    forgotPassword,
    initialState
  );

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900">
        Reset your password
      </h2>
      <p className="page-sub">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        {state.error && (
          <p className="alert-error">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="alert-success">
            {state.success}
          </p>
        )}
        <div>
          <label
            htmlFor="email"
            className="label"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-1 input"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full btn-primary"
        >
          {pending ? "Sending..." : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Remembered it?{" "}
        <Link
          href="/login"
          className="link"
        >
          Back to login
        </Link>
      </p>
    </div>
  );
}
