"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { updatePublicPage, type SettingsState } from "./actions";

const initialState: SettingsState = {};

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

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
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">
            🌐 Public page & lead capture
          </h2>
          <p className="mt-1 text-sm text-slate-500">
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
            className="block text-sm font-medium text-slate-700"
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
                className="font-medium text-indigo-600 hover:text-indigo-500"
              >
                /b/{slug}
              </Link>
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="tagline"
            className="block text-sm font-medium text-slate-700"
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
            className="block text-sm font-medium text-slate-700"
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
          {pending ? "Saving..." : "Save public page"}
        </button>
      </div>
    </form>
  );
}
