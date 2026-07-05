"use client";

import { useActionState, useRef, useEffect } from "react";
import type { CustomerNote } from "@/lib/types";
import { addNote, deleteNote, type CustomerFormState } from "../actions";

const initialState: CustomerFormState = {};

export default function NotesSection({
  customerId,
  notes,
}: {
  customerId: string;
  notes: CustomerNote[];
}) {
  const [state, formAction, pending] = useActionState(addNote, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <div>
      <form ref={formRef} action={formAction} className="flex gap-2">
        <input type="hidden" name="customer_id" value={customerId} />
        <input
          type="text"
          name="body"
          required
          placeholder="Add a note — call outcome, price discussed, anything worth remembering..."
          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
        >
          {pending ? "..." : "Add"}
        </button>
      </form>
      {state.error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      {notes.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          No notes yet. Notes build your memory of this customer over time.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {notes.map((note) => (
            <li
              key={note.id}
              className="group flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3"
            >
              <div>
                <p className="text-sm text-slate-700">{note.body}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {new Date(note.created_at).toLocaleString()}
                </p>
              </div>
              <form action={deleteNote}>
                <input type="hidden" name="id" value={note.id} />
                <input type="hidden" name="customer_id" value={customerId} />
                <button
                  type="submit"
                  aria-label="Delete note"
                  className="text-slate-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                >
                  &times;
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
