"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type AuthState } from "../actions";

const initialState: AuthState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900">Welcome back</h2>
      <p className="page-sub">
        Log in to your Jephelen account.
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        {state.error && (
          <p className="alert-error">
            {state.error}
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
        <div>
          <div className="flex items-center justify-between">
            <label
              htmlFor="password"
              className="label"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-sm text-indigo-600 hover:text-indigo-500"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 input"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full btn-primary"
        >
          {pending ? "Logging in..." : "Log in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        New to Jephelen?{" "}
        <Link
          href="/signup"
          className="link"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
