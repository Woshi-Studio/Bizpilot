"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/types";
import { deleteService, duplicateService } from "./actions";
import { lineLabel } from "@/lib/business-lines";
import { DeleteButton, EditButton, RowActionForm } from "@/components/row-actions";
import ServiceForm, { type EditableService } from "./service-form";

const UNIT_SUFFIX: Record<string, string> = {
  project: "/project",
  mo: "/mo",
  hr: "/hr",
  word: "/word",
  min: "/min",
};

function ServiceRow({
  s,
  currency,
  lines,
}: {
  s: EditableService;
  currency: string;
  lines?: string[];
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {s.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.image_url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">
              {s.name}
              {s.business_line && (
                <span className="ml-2 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
                  {lineLabel(s.business_line)}
                </span>
              )}
            </p>
            {s.description && <p className="mt-0.5 truncate text-xs text-slate-500">{s.description}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-2 text-sm font-semibold text-indigo-600">
            {formatMoney(Number(s.rate), currency)}
            {UNIT_SUFFIX[s.unit] ?? ""}
          </span>
          <EditButton onClick={() => setEditing((e) => !e)} open={editing} />
          <RowActionForm action={duplicateService} fields={{ id: s.id }} label="Duplicate" icon="copy" />
          <DeleteButton action={deleteService} id={s.id} what={s.name} />
        </div>
      </div>
      {editing && (
        <div className="mt-3">
          <ServiceForm service={s} lines={lines} onDone={() => setEditing(false)} />
        </div>
      )}
    </div>
  );
}

export default function ServicesList({
  services,
  currency,
  lines,
}: {
  services: EditableService[];
  currency: string;
  lines?: string[];
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
        <ServiceRow key={s.id} s={s} currency={currency} lines={lines} />
      ))}
    </div>
  );
}
