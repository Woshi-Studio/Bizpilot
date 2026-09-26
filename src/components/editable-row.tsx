"use client";

import { useState } from "react";
import InlineEditForm, { type EditField, type EditState } from "./inline-edit";
import { DeleteButton, EditButton } from "./row-actions";

// A list row (rendered on the server) with Edit + Delete on the right and
// the edit form opening underneath.
export default function EditableRow({
  id,
  children,
  className = "",
  fields,
  updateAction,
  deleteAction,
  what,
  deleteLabel,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  fields: EditField[];
  updateAction: (prev: EditState, formData: FormData) => Promise<EditState>;
  deleteAction: (formData: FormData) => void | Promise<void>;
  what: string;
  deleteLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <li className={className}>
      <div className="flex items-center gap-3">
        {children}
        <div className="flex shrink-0 items-center gap-0.5">
          <EditButton onClick={() => setEditing((e) => !e)} open={editing} />
          <DeleteButton action={deleteAction} id={id} what={what} />
          {deleteLabel && <span className="sr-only">{deleteLabel}</span>}
        </div>
      </div>
      {editing && (
        <InlineEditForm action={updateAction} id={id} fields={fields} onDone={() => setEditing(false)} />
      )}
    </li>
  );
}
