"use client";

import { useActionState, useEffect, useRef } from "react";
import FormError from "@/components/form-error";
import { searchCompany, type FinderFormState } from "./actions";

const initial: FinderFormState = {};

export default function SearchForm({ disabled, note }: { disabled: boolean; note: string }) {
  const [state, action, pending] = useActionState(searchCompany, initial);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) ref.current?.reset();
  }, [state.success]);

  return (
    <form ref={ref} action={action} className="card p-5 sm:p-6">
      <h2 className="section-title">Find one company&apos;s contacts</h2>
      <p className="mt-1 text-sm text-muted">{note}</p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-7">
        <div className="sm:col-span-3">
          <label className="label" htmlFor="f_company">
            Company name *
          </label>
          <input id="f_company" name="company" required maxLength={200} placeholder="Acme Plumbing" className="input mt-1" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="f_city">
            City
          </label>
          <input id="f_city" name="city" maxLength={120} placeholder="Mississauga" className="input mt-1" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="f_website">
            or website
          </label>
          <input id="f_website" name="website" maxLength={300} placeholder="acmeplumbing.ca" className="input mt-1" />
        </div>
      </div>

      <FormError error={state.error} upgrade={state.upgrade} className="mt-3" />
      {state.success && <p className="alert-success mt-3">{state.success}</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">Not found = no charge. Several matches = you pick, free.</p>
        <button type="submit" disabled={pending || disabled} className="btn-primary">
          {pending ? "Searching..." : "Search"}
        </button>
      </div>
    </form>
  );
}
