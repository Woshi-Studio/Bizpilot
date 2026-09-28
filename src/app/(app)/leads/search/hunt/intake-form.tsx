"use client";

import Link from "next/link";
import { useActionState } from "react";
import FormError from "@/components/form-error";
import {
  AUP_VERSION,
  FINDER_AREAS,
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
  industry_other: string;
  company_sizes: string[];
  place: string;
  radius_mi: number | null;
  province: string;
  area: string;
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
      <section>
        <h2 className="section-title">About your business</h2>
        <p className="mt-1 text-sm text-muted">
          So we can find companies that need what you sell.
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <label className="label" htmlFor="my_business">
              What does your business do? *
            </label>
            <input
              id="my_business"
              name="my_business"
              required
              maxLength={200}
              defaultValue={defaults.my_business}
              placeholder="Commercial cleaning in Kitchener-Waterloo"
              className="input mt-1"
            />
          </div>
          <div>
            <label className="label" htmlFor="offer">
              The services you provide *
            </label>
            <textarea
              id="offer"
              name="offer"
              required
              maxLength={500}
              rows={3}
              defaultValue={defaults.offer}
              placeholder="Nightly office cleaning, floor care, warehouse and plant cleaning."
              className="input mt-1"
            />
            <p className="mt-1 text-xs text-muted">Up to 500 characters. This also goes into your first-email template.</p>
          </div>
          <div>
            <label className="label" htmlFor="target">
              Your ideal customer
            </label>
            <input
              id="target"
              name="target"
              maxLength={500}
              defaultValue={defaults.target}
              placeholder="Offices and factories with 10 to 200 people"
              className="input mt-1"
            />
          </div>
        </div>
      </section>

      <fieldset>
        <legend className="label">What kind of businesses are your customers?</legend>
        <p className="mt-1 text-xs text-muted">Pick as many as you like. &quot;Find me customers&quot; looks for these.</p>
        <Chips name="industries" options={FINDER_INDUSTRIES} selected={defaults.industries} />
        <div className="mt-3">
          <label className="text-xs font-medium text-muted" htmlFor="industry_other">
            Other: type it
          </label>
          <input
            id="industry_other"
            name="industry_other"
            maxLength={120}
            defaultValue={defaults.industry_other}
            placeholder="e.g. dental labs"
            className="input mt-1"
          />
        </div>
        <p className="mt-3 text-xs font-medium text-muted">Company size</p>
        <Chips name="company_sizes" options={FINDER_SIZES} selected={defaults.company_sizes} />
      </fieldset>

      <fieldset>
        <legend className="label">Where</legend>
        <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <select name="area" defaultValue={defaults.area || "CA"} aria-label="Area" className="input sm:col-span-2">
            {FINDER_AREAS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          <input
            name="province"
            maxLength={60}
            defaultValue={defaults.province}
            placeholder="Province / state (optional)"
            aria-label="Province or state"
            className="input sm:col-span-2"
          />
          <input
            name="place"
            maxLength={120}
            defaultValue={defaults.place}
            placeholder="City (optional)"
            aria-label="City, the centre of the radius"
            className="input sm:col-span-2"
          />
          <select
            name="radius_mi"
            defaultValue={defaults.radius_mi === null ? "" : String(defaults.radius_mi)}
            aria-label="Radius around the city"
            className="input sm:col-span-2"
          >
            {FINDER_RADII.map((r) => (
              <option key={r.label} value={r.miles === null ? "" : String(r.miles)}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-xs text-muted">
          The city is the centre of the radius. With N/A we search the whole area.
        </p>
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
          <Link href="/leads/search" className="link font-semibold">
            Go to search
          </Link>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/leads/search" className="btn-ghost">
          Cancel
        </Link>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
