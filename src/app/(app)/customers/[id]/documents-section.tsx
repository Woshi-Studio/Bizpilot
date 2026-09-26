"use client";

import { useActionState, useEffect, useRef } from "react";
import LocalTime from "@/components/local-time";
import {
  uploadDocument,
  deleteDocument,
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

export default function DocumentsSection({
  customerId,
  documents,
  missing,
}: {
  customerId: string;
  documents: CustomerDocument[];
  missing?: boolean;
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
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <div className="min-w-0">
                <a
                  href={`/customers/${customerId}/documents/${d.id}`}
                  className="block truncate text-sm link"
                >
                  {d.name}
                </a>
                <p className="text-xs text-slate-400">
                  {formatSize(d.size)} · <LocalTime iso={d.uploaded_at} />
                </p>
              </div>
              <form
                action={deleteDocument}
                onSubmit={(e) => {
                  if (!confirm(`Delete ${d.name}? This can't be undone.`)) {
                    e.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="id" value={d.id} />
                <button
                  type="submit"
                  className="text-xs font-medium text-slate-400 hover:text-red-600"
                >
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
