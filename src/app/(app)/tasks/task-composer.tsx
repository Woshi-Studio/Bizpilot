"use client";

import { useActionState, useRef, useEffect } from "react";
import { createTask, type TaskFormState } from "./actions";

const initialState: TaskFormState = {};

export default function TaskComposer({
  customers,
}: {
  customers: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    createTask,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state]);

  const inputClass =
    "block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <form
        ref={formRef}
        action={formAction}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          type="text"
          name="title"
          required
          placeholder="What needs doing? e.g. Send quote to John"
          className={`${inputClass} flex-1`}
        />
        <input type="date" name="due_date" className={`${inputClass} sm:w-40`} />
        <select
          name="customer_id"
          defaultValue=""
          className={`${inputClass} sm:w-48`}
        >
          <option value="">No customer</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
        >
          {pending ? "Adding..." : "Add task"}
        </button>
      </form>
      {state.error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </div>
  );
}
