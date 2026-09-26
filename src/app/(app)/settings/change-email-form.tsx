"use client";

import { useActionState } from "react";
import { changeEmail, type AuthState } from "@/app/(auth)/actions";

const initialState: AuthState = {};

const inputClass =
  "mt-1 input";

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
      className="card p-6"
    >
      <h2 className="section-title">Login email</h2>
      <p className="page-sub">
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
          className="label"
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
        <p className="mt-3 alert-error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="mt-3 alert-success">
          {state.success}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary"
        >
          {pending ? "Sending..." : "Change login email"}
        </button>
      </div>
    </form>
  );
}
