"use client";

import Icon from "./icons";

// The same Edit / Duplicate / Delete buttons on every list row.
// Delete always asks first.

const base =
  "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors";

export function EditButton({
  onClick,
  open = false,
  label = "Edit",
}: {
  onClick: () => void;
  open?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={`${base} ${open ? "bg-surface-3 text-ink" : "text-muted hover:bg-surface-3 hover:text-ink"}`}
    >
      <Icon name="edit" className="h-3.5 w-3.5" />
      {open ? "Close" : label}
    </button>
  );
}

export function RowActionForm({
  action,
  fields,
  label,
  icon,
  confirmText,
  danger = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  label: string;
  icon: "trash" | "copy";
  confirmText?: string;
  danger?: boolean;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirmText && !confirm(confirmText)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        className={`${base} ${
          danger ? "text-muted hover:bg-red-50 hover:text-red-600" : "text-muted hover:bg-surface-3 hover:text-ink"
        }`}
      >
        <Icon name={icon} className="h-3.5 w-3.5" />
        {label}
      </button>
    </form>
  );
}

export function DeleteButton({
  action,
  id,
  what,
  fields = {},
}: {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  what: string;
  fields?: Record<string, string>;
}) {
  return (
    <RowActionForm
      action={action}
      fields={{ id, ...fields }}
      label="Delete"
      icon="trash"
      danger
      confirmText={`Delete ${what}? This can't be undone.`}
    />
  );
}
