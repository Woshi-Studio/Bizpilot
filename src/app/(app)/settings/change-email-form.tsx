"use client";

import { useActionState } from "react";
import { changeEmail, type AuthState } from "@/app/(auth)/actions";

const initialState: AuthState = {};

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default function ChangeEmailForm({
  currentEmail,
  pendingEmail,
  notice,
}: {
  currentEmail: string;
  pendingEmail: string | null;
  notice: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    changeEmail,
    initialState
  );

  return (
    <form
      action={formAction}
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-slate-800">Login email</h2>
      <p className="mt-1 text-sm text-slate-500">
        You log in with{" "}
        <span className="font-medium text-slate-700">
          {currentEmail || "(no email)"}
        </span>
        .
      </p>
      {pendingEmail && (
        <p className="mt-1 text-xs text-slate-500">
          Waiting for confirmation of{" "}
          <span className="font-medium text-slate-700">{pendingEmail}</span>.
        </p>
      )}

      {notice && (
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {notice}
        </p>
      )}

      <div className="mt-4">
        <label
          htmlFor="new_email"
          className="block text-sm font-medium text-slate-700"
        >
          New email
        </label>
        <input
          id="new_email"
          name="new_email"
          type="email"
          autoComplete="email"
          required
          className={inputClass}
        />
      </div>

      {state.error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {state.success}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
        >
          {pending ? "Sending..." : "Change login email"}
        </button>
      </div>
    </form>
  );
}
