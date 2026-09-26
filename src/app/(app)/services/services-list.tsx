"use client";

import { formatMoney } from "@/lib/types";
import type { Service } from "@/lib/types";
import { deleteService } from "./actions";
import { lineLabel } from "@/lib/business-lines";

const UNIT_SUFFIX: Record<string, string> = {
  project: "/project",
  mo: "/mo",
  hr: "/hr",
  word: "/word",
  min: "/min",
};

export default function ServicesList({
  services,
  currency,
}: {
  services: Service[];
  currency: string;
}) {
  if (!services.length) {
    return (
      <div className="card-empty p-8 text-center text-sm text-slate-400">
        No services yet. Add your rate card above — it&apos;ll show up when you
        create tasks and invoices.
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100 card">
      {services.map((s) => (
        <div
          key={s.id}
          className="flex items-center justify-between gap-4 px-5 py-4"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">
              {s.name}
              {s.business_line && (
                <span className="ml-2 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
                  {lineLabel(s.business_line)}
                </span>
              )}
            </p>
            {s.description && (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {s.description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-sm font-semibold text-indigo-600">
              {formatMoney(s.rate, currency)}
              {UNIT_SUFFIX[s.unit] ?? ""}
            </span>
            <form action={deleteService}>
              <input type="hidden" name="id" value={s.id} />
              <button
                type="submit"
                className="text-xs font-medium text-slate-400 hover:text-red-600"
              >
                Delete
              </button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
