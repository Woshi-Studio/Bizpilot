"use client";

import Link from "next/link";
import { useActionState } from "react";
import FormError from "@/components/form-error";
import {
  AUP_VERSION,
  FINDER_COUNTRIES,
  FINDER_INDUSTRIES,
  FINDER_NEEDS,
  FINDER_RADII,
  FINDER_SIZES,
} from "@/lib/finder";
import { saveIntake, type FinderFormState } from "../actions";

export type IntakeDefaults = {
  my_business: string;
  offer: string;
  target: string;
  industries: string[];
  company_sizes: string[];
  place: string;
  radius_km: number | null;
  province: string;
  country: string;
  needs: string[];
  exclude: string;
  aupAccepted: boolean;
};

const initial: FinderFormState = {};

function Chips({
  name,
  options,
  selected,
}: {
  name: string;
  options: readonly { value: string; label: string }[];
  selected: string[];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.value} className="chip chip-check">
          <input type="checkbox" name={name} value={o.value} defaultChecked={selected.includes(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export default function IntakeForm({ defaults }: { defaults: IntakeDefaults }) {
  const [state, action, pending] = useActionState(saveIntake, initial);

  return (
    <form action={action} className="card space-y-6 p-5 sm:p-6">
      <div>
        <label className="label" htmlFor="my_business">
          Your business *
        </label>
        <input
          id="my_business"
          name="my_business"
          required
          maxLength={200}
          defaultValue={defaults.my_business}
          placeholder="Bright Harbor Studio, design for local shops"
          className="input mt-1"
        />
      </div>

      <div>
        <label className="label" htmlFor="offer">
          Your idea or offer *
        </label>
        <textarea
          id="offer"
          name="offer"
          required
          maxLength={500}
          rows={3}
          defaultValue={defaults.offer}
          placeholder="A simple website with online booking, set up in a week."
          className="input mt-1"
        />
        <p className="mt-1 text-xs text-muted">Up to 500 characters. This goes into your first-email template.</p>
      </div>

      <fieldset>
        <legend className="label">Who is your customer?</legend>
        <input
          name="target"
          maxLength={500}
          defaultValue={defaults.target}
          placeholder="Independent cafés and salons with no booking page"
          className="input mt-1"
          aria-label="Target customer"
        />
        <p className="mt-3 text-xs font-medium text-muted">Industry</p>
        <Chips
          name="industries"
          options={FINDER_INDUSTRIES.map((v) => ({ value: v, label: v }))}
          selected={defaults.industries}
        />
        <p className="mt-3 text-xs font-medium text-muted">Company size</p>
        <Chips name="company_sizes" options={FINDER_SIZES} selected={defaults.company_sizes} />
      </fieldset>

      <fieldset>
        <legend className="label">Where</legend>
        <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            name="place"
            maxLength={120}
            defaultValue={defaults.place}
            placeholder="City or area"
            aria-label="City or area"
            className="input sm:col-span-2"
          />
          <select name="radius_km" defaultValue={defaults.radius_km ?? 15} aria-label="Radius" className="input">
            {FINDER_RADII.map((r) => (
              <option key={r} value={r}>
                Within {r} km
              </option>
            ))}
          </select>
          <input
            name="province"
            maxLength={60}
            defaultValue={defaults.province}
            placeholder="Province / state"
            aria-label="Province or state"
            className="input"
          />
          <select name="country" defaultValue={defaults.country || "CA"} aria-label="Country" className="input sm:col-span-2">
            {FINDER_COUNTRIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">What you need</legend>
        <Chips name="needs" options={FINDER_NEEDS} selected={defaults.needs} />
        <p className="mt-2 text-xs text-muted">
          We start with phone, website and contact-form links. Emails come only when the business
          publishes one on its own website. Quebec, the EU and the UK get company contacts only
          (like info@), never a person&apos;s own email. Named decision-makers aren&apos;t searched yet.
        </p>
      </fieldset>

      <div>
        <label className="label" htmlFor="exclude">
          Leave out
        </label>
        <textarea
          id="exclude"
          name="exclude"
          maxLength={1000}
          rows={2}
          defaultValue={defaults.exclude}
          placeholder="Businesses you already work with, chains, competitors..."
          className="input mt-1"
        />
      </div>

      <div className="rounded-xl border border-line/70 bg-surface-2 p-4">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="aup"
            value="yes"
            required
            defaultChecked={defaults.aupAccepted}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>
            I&apos;ve read the{" "}
            <Link href="/acceptable-use" target="_blank" className="link">
              Acceptable Use rules
            </Link>{" "}
            and I&apos;ll follow them: one-to-one messages only, I say who I am, I include a way to
            say no, and I respect &quot;no solicitation&quot; notes. *
          </span>
        </label>
        <p className="mt-2 pl-7 text-xs text-muted">Version {AUP_VERSION}. We save the date you agreed.</p>
      </div>

      <FormError error={state.error} upgrade={state.upgrade} />
      {state.success && (
        <p className="alert-success">
          {state.success}{" "}
          <Link href="/leads/found" className="link font-semibold">
            Go to search
          </Link>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/leads/found" className="btn-ghost">
          Cancel
        </Link>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
