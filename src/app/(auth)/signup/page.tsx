"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type AuthState } from "../actions";

const initialState: AuthState = {};

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900">
        Create your account
      </h2>
      <p className="page-sub">
        Start running your freelance business smarter.
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
            htmlFor="full_name"
            className="label"
          >
            Full name
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            autoComplete="name"
            required
            className="mt-1 input"
          />
        </div>
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
        <div>
          <label
            htmlFor="password"
            className="label"
          >
            Password
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
          <p className="mt-1 text-xs text-slate-400">At least 8 characters.</p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full btn-primary"
        >
          {pending ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link
          href="/login"
          className="link"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
