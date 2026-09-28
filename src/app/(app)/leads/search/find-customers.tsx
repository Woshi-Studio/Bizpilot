"use client";

import Link from "next/link";
import { useActionState } from "react";
import FormError from "@/components/form-error";
import { findCustomers, type FinderFormState } from "./actions";

const initial: FinderFormState = {};

// "Find me customers": starts a discovery run from the saved intake.
export default function FindCustomers({
  ready,
  summary,
  count,
  locked,
}: {
  ready: boolean;
  summary: string | null;
  count: number;
  locked: boolean;
}) {
  const [state, action, pending] = useActionState(findCustomers, initial);
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="section-title">Find me customers</h2>
          <p className="mt-1 text-sm text-muted">
            {ready
              ? `We look for up to ${count} new businesses that need what you sell${summary ? ` (${summary})` : ""}, then find the best way to reach each one. Companies you already have are skipped.`
              : "Tell us what your business does and who your customers are, and we'll go find companies that need what you sell."}
            {locked && ready ? " On your plan the results come back locked until you upgrade to Boss." : ""}
          </p>
        </div>
        {ready ? (
          <form action={action}>
            <button type="submit" disabled={pending} className="btn-primary">
              {pending ? "Starting..." : "Find me customers"}
            </button>
          </form>
        ) : (
          <Link href="/leads/search/hunt" className="btn-primary">
            What are you hunting?
          </Link>
        )}
      </div>
      <FormError error={state.error} upgrade={state.upgrade} className="mt-3" />
      {state.success && <p className="alert-success mt-3">{state.success}</p>}
    </div>
  );
}
