"use client";

import { useActionState, useEffect } from "react";

export type EditState = { error?: string; success?: string; savedAt?: number };

export type EditField = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "textarea" | "select";
  defaultValue?: string | number | null;
  options?: { value: string; label: string }[];
  step?: string;
  required?: boolean;
  wide?: boolean;
};

// A small edit form that opens under a list row. Enter saves (except in
// a textarea), Escape closes.
export default function InlineEditForm({
  action,
  id,
  fields,
  onDone,
}: {
  action: (prev: EditState, formData: FormData) => Promise<EditState>;
  id: string;
  fields: EditField[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, {} as EditState);

  useEffect(() => {
    if (state.savedAt) onDone();
  }, [state.savedAt, onDone]);

  return (
    <form
      action={formAction}
      onKeyDown={(e) => {
        if (e.key === "Escape") onDone();
      }}
      className="mt-2 rounded-2xl bg-surface-2 p-3"
    >
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        {fields.map((f) => {
          const common = {
            id: `edit-${f.name}-${id}`,
            name: f.name,
            defaultValue: f.defaultValue ?? "",
            required: f.required,
            className: "input mt-1",
          };
          return (
            <label
              key={f.name}
              htmlFor={common.id}
              className={`text-xs font-medium text-ink-2 ${f.wide || f.type === "textarea" ? "sm:col-span-4" : f.type === "text" ? "sm:col-span-2" : ""}`}
            >
              {f.label}
              {f.type === "textarea" ? (
                <textarea {...common} rows={3} />
              ) : f.type === "select" ? (
                <select {...common}>
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input {...common} type={f.type ?? "text"} step={f.step} />
              )}
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        {state.error && <p className="mr-auto text-xs text-red-600">{state.error}</p>}
        <button type="button" onClick={onDone} className="btn-ghost btn-sm">
          Cancel
        </button>
        <button type="submit" disabled={pending} className="btn-primary btn-sm">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
