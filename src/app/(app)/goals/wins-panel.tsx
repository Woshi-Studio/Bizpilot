"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { WIN_CATEGORIES, type Win } from "@/lib/types";
import { addWin, deleteWin, updateWin, type GoalsFormState } from "./actions";
import InlineEditForm from "@/components/inline-edit";
import { DeleteButton, EditButton } from "@/components/row-actions";
import LocalTime from "@/components/local-time";

const initialState: GoalsFormState = {};

const inputClass =
  "mt-1 input";

export default function WinsPanel({ wins }: { wins: Win[] }) {
  const [state, formAction, pending] = useActionState(addWin, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <div className="card p-6">
      <h2 className="section-title">Wins log</h2>

      <form ref={formRef} action={formAction} className="mt-4 space-y-3">
        {state.error && (
          <p className="alert-error">
            {state.error}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <input
              name="title"
              type="text"
              required
              placeholder="e.g. Signed 2nd client!"
              className={inputClass}
            />
          </div>
          <select name="category" defaultValue="client" className={inputClass}>
            {WIN_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <textarea
          name="details"
          rows={2}
          placeholder="What happened? Why does it matter?"
          className={inputClass}
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="btn-primary"
          >
            {pending ? "Saving..." : "Log win"}
          </button>
        </div>
      </form>

      <div className="mt-5 max-h-96 space-y-3 overflow-y-auto border-t border-slate-100 pt-4">
        {wins.length === 0 && (
          <p className="text-sm text-slate-400">No wins logged yet.</p>
        )}
        {wins.map((w) => (
          <div
            key={w.id}
            className="rounded-lg border-l-4 border-indigo-400 bg-slate-50 p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {w.title}
                </p>
                {w.details && (
                  <p className="mt-1 text-xs text-slate-500">{w.details}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-0.5">
                <EditButton onClick={() => setEditing(editing === w.id ? null : w.id)} open={editing === w.id} />
                <DeleteButton action={deleteWin} id={w.id} what={`the win "${w.title}"`} />
              </div>
            </div>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
              <LocalTime iso={w.created_at} mode="date" />
            </p>
            {editing === w.id && (
              <InlineEditForm
                action={updateWin}
                id={w.id}
                onDone={() => setEditing(null)}
                fields={[
                  { name: "title", label: "Win", type: "text", defaultValue: w.title, required: true, wide: true },
                  { name: "category", label: "Kind", type: "select", defaultValue: w.category, options: WIN_CATEGORIES.map((c) => ({ value: c.value, label: c.label })) },
                  { name: "details", label: "Details", type: "textarea", defaultValue: w.details },
                ]}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
