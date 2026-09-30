"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import FormError from "@/components/form-error";
import { chipText, detectQuery } from "@/lib/finder-query";
import { searchLeads, type FinderFormState } from "./actions";

const initial: FinderFormState = {};

export default function SearchForm({
  disabled,
  note,
  needsAup,
  defaultCountry,
}: {
  disabled: boolean;
  note: string;
  needsAup: boolean;
  defaultCountry: string | null;
}) {
  const [state, action, pending] = useActionState(searchLeads, initial);
  const ref = useRef<HTMLFormElement>(null);
  const [q, setQ] = useState("");
  const [asPerson, setAsPerson] = useState(false);

  const detected = useMemo(() => detectQuery(q, defaultCountry), [q, defaultCountry]);
  const isName = detected?.kind === "name";
  const person = isName && asPerson;
  const chip = chipText(detected, person);
  const bad = detected?.kind === "email" && detected.freeMail;

  // After a search goes through, start fresh (adjusting state during
  // render, as React recommends, instead of in an effect).
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.success) {
      setQ("");
      setAsPerson(false);
    }
  }
  useEffect(() => {
    if (state.success) ref.current?.reset();
  }, [state.success]);

  return (
    <form ref={ref} action={action} className="card p-5 sm:p-6">
      <h2 className="section-title">Search for a business</h2>
      <p className="mt-1 text-sm text-muted">{note}</p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-7">
        <div className="sm:col-span-5">
          <label className="label" htmlFor="f_q">
            Company, website, email, phone or a person&apos;s name
          </label>
          <input
            id="f_q"
            name="q"
            required
            maxLength={300}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Acme Plumbing · acmeplumbing.ca · info@acme.ca · 416-555-0100"
            autoComplete="off"
            className="input mt-1"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="f_city">
            City <span className="font-normal text-muted">(optional)</span>
          </label>
          <input id="f_city" name="city" maxLength={120} placeholder="Mississauga" className="input mt-1" />
        </div>
      </div>

      <div className="mt-2 flex min-h-7 flex-wrap items-center gap-2 text-xs">
        {chip && (
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-medium ${
              bad ? "border-amber-200 bg-amber-50 text-amber-800" : "border-line/70 bg-surface-2 text-ink-2"
            }`}
          >
            {chip}
          </span>
        )}
        {isName && (
          <button type="button" className="link font-medium" onClick={() => setAsPerson((v) => !v)}>
            {asPerson ? "No, it's a company" : "It's a person →"}
          </button>
        )}
        {detected?.kind === "phone" && (
          <span className="text-muted">Add a city for numbers we don&apos;t know yet.</span>
        )}
      </div>

      {person && (
        <div className="mt-3 rounded-xl border border-line/70 bg-surface-2 p-4">
          <input type="hidden" name="as_person" value="1" />
          <label className="label" htmlFor="f_person_company">
            Where do they work? *
          </label>
          <input
            id="f_person_company"
            name="person_company"
            required
            maxLength={200}
            placeholder="Company name or website"
            className="input mt-1"
          />
          <p className="mt-2 text-xs text-muted">
            We only look for people listed as a contact on their own business&apos;s website. We never
            search personal social media or people-finder sites.
          </p>
        </div>
      )}

      {needsAup && (
        <label className="mt-4 flex items-start gap-3 rounded-xl border border-line/70 bg-surface-2 p-4 text-sm">
          <input type="checkbox" name="aup" value="yes" required className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            I&apos;ve read the{" "}
            <Link href="/acceptable-use" target="_blank" className="link">
              Acceptable Use rules
            </Link>{" "}
            and I&apos;ll follow them: one-to-one messages only, I say who I am, I include a way to say
            no. *
          </span>
        </label>
      )}

      <FormError error={state.error} upgrade={state.upgrade} upgradeHref="/plans#lead-finder" upgradeLabel="Get leads" className="mt-3" />
      {state.success && <p className="alert-success mt-3">{state.success}</p>}

      <div className="mt-4 flex flex-col items-end">
        <button type="submit" disabled={pending || disabled || bad} className="btn-primary">
          {pending ? "Searching..." : "Search"}
        </button>
        <p className="mt-1.5 text-xs text-muted">Not found = no charge. Several matches = you pick, free.</p>
      </div>
    </form>
  );
}
