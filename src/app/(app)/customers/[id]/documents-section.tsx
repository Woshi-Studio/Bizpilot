"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import SendDocButton from "@/components/send-doc-dialog";
import { DeleteButton, EditButton } from "@/components/row-actions";
import LocalTime from "@/components/local-time";
import {
  uploadDocument,
  deleteDocument,
  renameDocument,
  type DocumentFormState,
} from "../document-actions";
import FormError from "@/components/form-error";

export type CustomerDocument = {
  id: string;
  name: string;
  size: number;
  mime: string;
  uploaded_at: string;
};

const initialState: DocumentFormState = {};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type DocSendInfo = {
  to: { name: string; email: string | null };
  canSend: boolean;
  sendNote?: string;
  businessName: string;
  fromName: string;
};

function DocRow({ d, customerId, send }: { d: CustomerDocument; customerId: string; send?: DocSendInfo }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(renameDocument, initialState);
  const first = send?.to.name.split(" ")[0] || "there";
  return (
    <li className="px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <a href={`/customers/${customerId}/documents/${d.id}`} className="block truncate text-sm link">
            {d.name}
          </a>
          <p className="text-xs text-slate-400">
            {formatSize(d.size)} · <LocalTime iso={d.uploaded_at} />
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {send && (
            <SendDocButton
              kind="document"
              id={d.id}
              title={d.name}
              to={send.to}
              subject={`${d.name} from ${send.businessName}`}
              body={`Hi ${first},

Here is ${d.name}.

You can also download it here: {link}

Thank you!
${send.fromName}`}
              canSend={send.canSend}
              sendNote={send.sendNote}
              label="Send"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surface-3 hover:text-ink"
            />
          )}
          <EditButton onClick={() => setEditing((e) => !e)} open={editing} label="Rename" />
          <DeleteButton action={deleteDocument} id={d.id} what={d.name} />
        </div>
      </div>
      {editing && (
        <form action={action} className="mt-2 flex gap-2">
          <input type="hidden" name="id" value={d.id} />
          <input name="name" defaultValue={d.name} maxLength={255} required aria-label="File name" className="input" />
          <button type="submit" disabled={pending} className="btn-primary btn-sm shrink-0">
            Save
          </button>
          {state.error && <p className="alert-error text-xs">{state.error}</p>}
        </form>
      )}
    </li>
  );
}

export default function DocumentsSection({
  customerId,
  documents,
  missing,
  send,
}: {
  customerId: string;
  documents: CustomerDocument[];
  missing?: boolean;
  send?: DocSendInfo;
}) {
  const [state, formAction, pending] = useActionState(
    uploadDocument,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  if (missing) {
    return (
      <p className="alert-warn">
        Documents aren&apos;t set up yet — run migration 0014 in Supabase.
      </p>
    );
  }

  return (
    <div>
      <form
        ref={formRef}
        action={formAction}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <input type="hidden" name="customer_id" value={customerId} />
        <input
          type="file"
          name="file"
          required
          accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 btn-primary"
        >
          {pending ? "Uploading..." : "Upload"}
        </button>
      </form>
      <p className="mt-1 text-xs text-slate-400">
        PDF, JPG, PNG, WEBP, DOCX or XLSX · up to 10 MB · only you can see
        them.
      </p>
      <FormError error={state.error} upgrade={state.upgrade} className="mt-2" />
      {state.success && (
        <p className="mt-2 alert-success">
          {state.success}
        </p>
      )}

      {documents.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          No files yet. Contracts, IDs, quotes and receipts for this customer
          can live here.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {documents.map((d) => (
            <DocRow key={d.id} d={d} customerId={customerId} send={send} />
          ))}
        </ul>
      )}
    </div>
  );
}
