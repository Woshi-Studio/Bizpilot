"use client";

import { useActionState, useRef, useEffect } from "react";
import { WIN_CATEGORIES, type Win } from "@/lib/types";
import { addWin, deleteWin, type GoalsFormState } from "./actions";

const initialState: GoalsFormState = {};

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default function WinsPanel({ wins }: { wins: Win[] }) {
  const [state, formAction, pending] = useActionState(addWin, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">Wins log</h2>

      <form ref={formRef} action={formAction} className="mt-4 space-y-3">
        {state.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
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
            className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
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
              <form action={deleteWin}>
                <input type="hidden" name="id" value={w.id} />
                <button
                  type="submit"
                  className="shrink-0 text-xs font-medium text-slate-400 hover:text-red-600"
                >
                  &times;
                </button>
              </form>
            </div>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
              {new Date(w.created_at).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
