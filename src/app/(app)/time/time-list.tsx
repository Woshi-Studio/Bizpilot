"use client";

import { Fragment, useState } from "react";
import type { TimeEntry } from "@/lib/types";
import { deleteTimeEntry, setTimeBilled, updateTimeEntry } from "./actions";
import InlineEditForm from "@/components/inline-edit";
import { DeleteButton, EditButton } from "@/components/row-actions";

const BILLED_META: Record<string, string> = {
  unbilled: "bg-amber-50 text-amber-700 border-amber-200",
  billed: "bg-green-50 text-green-700 border-green-200",
  included: "bg-slate-100 text-slate-500 border-slate-200",
};

export default function TimeList({
  entries,
  customerNames,
  taskTitles,
}: {
  entries: TimeEntry[];
  customerNames: Record<string, string>;
  taskTitles: Record<string, string>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  if (!entries.length) {
    return (
      <div className="card-empty p-8 text-center text-sm text-slate-400">
        No time logged yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto card">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead>
          <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-400">
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Task</th>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3">Hours</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map((e) => (
            <Fragment key={e.id}>
            <tr>
              <td className="px-4 py-3 text-slate-500">{e.entry_date}</td>
              <td className="px-4 py-3 text-slate-700">
                {e.customer_id ? customerNames[e.customer_id] ?? "—" : "—"}
              </td>
              <td className="px-4 py-3 text-slate-500">
                {e.task_id ? taskTitles[e.task_id] ?? "—" : "—"}
              </td>
              <td className="px-4 py-3 text-slate-500">
                {e.description ?? "—"}
              </td>
              <td className="px-4 py-3 font-semibold text-slate-800">
                {e.hours}h
              </td>
              <td className="px-4 py-3">
                <form action={setTimeBilled}>
                  <input type="hidden" name="id" value={e.id} />
                  <select
                    name="billed"
                    defaultValue={e.billed}
                    onChange={(ev) => ev.currentTarget.form?.requestSubmit()}
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${BILLED_META[e.billed]}`}
                  >
                    <option value="unbilled">Unbilled</option>
                    <option value="billed">Billed</option>
                    <option value="included">Included</option>
                  </select>
                </form>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-0.5">
                  <EditButton onClick={() => setEditing(editing === e.id ? null : e.id)} open={editing === e.id} />
                  <DeleteButton action={deleteTimeEntry} id={e.id} what={`${e.hours}h on ${e.entry_date}`} />
                </div>
              </td>
            </tr>
            {editing === e.id && (
              <tr>
                <td colSpan={7} className="px-4 pb-3">
                  <InlineEditForm
                    action={updateTimeEntry}
                    id={e.id}
                    onDone={() => setEditing(null)}
                    fields={[
                      { name: "entry_date", label: "Date", type: "date", defaultValue: e.entry_date, required: true },
                      { name: "hours", label: "Hours", type: "number", step: "0.25", defaultValue: e.hours, required: true },
                      { name: "description", label: "Description", type: "text", defaultValue: e.description },
                    ]}
                  />
                </td>
              </tr>
            )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
