"use client";

import Link from "next/link";
import { useActionState } from "react";
import { confirmRemoval, type ConfirmState } from "./actions";

const initial: ConfirmState = {};

export default function ConfirmForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(confirmRemoval, initial);

  if (state.status === "done") {
    return (
      <div role="status" className="not-prose mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
        <p className="font-semibold">Done. Your data is removed.</p>
        <p className="mt-1">
          We deleted {state.companies ?? 0} business record(s) and {state.contacts ?? 0} other
          contact(s), and added your details to our do-not-collect list.
        </p>
      </div>
    );
  }
  if (state.status === "expired" || state.status === "unknown") {
    return (
      <div role="alert" className="not-prose mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">This link has expired or isn&apos;t valid.</p>
        <p className="mt-1">
          <Link href="/remove-my-data" className="underline">Send a new request</Link>. Links work for 72 hours.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="not-prose mt-6">
      <input type="hidden" name="t" value={token} />
      {state.status === "error" && (
        <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Something went wrong on our side. Please try again in a minute.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Removing..." : "Confirm: remove my data"}
      </button>
    </form>
  );
}
