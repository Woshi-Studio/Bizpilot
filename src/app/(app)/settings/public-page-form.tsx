"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { updatePublicPage, type SettingsState } from "./actions";

const initialState: SettingsState = {};

const inputClass =
  "mt-1 input";

export default function PublicPageForm({
  defaults,
}: {
  defaults: {
    enabled: boolean;
    slug: string;
    tagline: string;
    services: string;
  };
}) {
  const [state, formAction, pending] = useActionState(
    updatePublicPage,
    initialState
  );
  const [enabled, setEnabled] = useState(defaults.enabled);
  const [slug, setSlug] = useState(defaults.slug);

  return (
    <form
      action={formAction}
      className="card p-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">
            🌐 Public page & lead capture
          </h2>
          <p className="page-sub">
            A simple page anyone can visit — messages land in your Leads
            inbox.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            name="public_page_enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          On
        </label>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="slug"
            className="label"
          >
            Page address
          </label>
          <div className="mt-1 flex items-center gap-1">
            <span className="text-sm text-slate-400">/b/</span>
            <input
              id="slug"
              name="slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="jons-design-studio"
              className={`${inputClass} mt-0`}
            />
          </div>
          {enabled && slug && (
            <p className="mt-1 text-xs text-slate-400">
              Your page:{" "}
              <Link
                href={`/b/${slug}`}
                target="_blank"
                className="link"
              >
                /b/{slug}
              </Link>
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="tagline"
            className="label"
          >
            Tagline
          </label>
          <input
            id="tagline"
            name="tagline"
            type="text"
            defaultValue={defaults.tagline}
            placeholder="e.g. Clean, fast websites for small businesses"
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label
            htmlFor="services"
            className="label"
          >
            Services <span className="text-slate-400">(one per line)</span>
          </label>
          <textarea
            id="services"
            name="services"
            rows={4}
            defaultValue={defaults.services}
            placeholder={"Website design\nLogo & branding\nMonthly maintenance"}
            className={inputClass}
          />
        </div>
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
          {pending ? "Saving..." : "Save public page"}
        </button>
      </div>
    </form>
  );
}
