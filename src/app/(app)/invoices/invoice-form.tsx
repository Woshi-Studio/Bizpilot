"use client";

import { useActionState, useState } from "react";
import { formatMoney } from "@/lib/types";
import { createInvoice, type InvoiceFormState } from "./actions";

const initialState: InvoiceFormState = {};

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

type Row = { description: string; quantity: string; unit_price: string };

export default function InvoiceForm({
  customers,
  currency,
}: {
  customers: { id: string; name: string }[];
  currency: string;
}) {
  const [state, formAction, pending] = useActionState(
    createInvoice,
    initialState
  );
  const [rows, setRows] = useState<Row[]>([
    { description: "", quantity: "1", unit_price: "" },
  ]);

  const updateRow = (idx: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const total = rows.reduce((sum, r) => {
    const q = Number(r.quantity);
    const p = Number(r.unit_price);
    return Number.isFinite(q) && Number.isFinite(p) ? sum + q * p : sum;
  }, 0);

  const itemsJson = JSON.stringify(
    rows.map((r) => ({
      description: r.description,
      quantity: Number(r.quantity),
      unit_price: Number(r.unit_price),
    }))
  );

  return (
    <form
      action={formAction}
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <input type="hidden" name="items" value={itemsJson} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="doc_type"
            className="block text-sm font-medium text-slate-700"
          >
            Document type
          </label>
          <select id="doc_type" name="doc_type" className={inputClass}>
            <option value="invoice">Invoice</option>
            <option value="quote">Quote</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="customer_id"
            className="block text-sm font-medium text-slate-700"
          >
            Customer
          </label>
          <select
            id="customer_id"
            name="customer_id"
            defaultValue=""
            className={inputClass}
          >
            <option value="">No customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="issue_date"
            className="block text-sm font-medium text-slate-700"
          >
            Issue date
          </label>
          <input
            id="issue_date"
            name="issue_date"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="due_date"
            className="block text-sm font-medium text-slate-700"
          >
            Due date <span className="text-slate-400">(optional)</span>
          </label>
          <input id="due_date" name="due_date" type="date" className={inputClass} />
        </div>
      </div>

      <h2 className="mt-6 text-sm font-semibold text-slate-800">Line items</h2>
      <div className="mt-2 space-y-2">
        {rows.map((row, idx) => (
          <div key={idx} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={row.description}
              onChange={(e) => updateRow(idx, { description: e.target.value })}
              placeholder="Description — e.g. Logo design"
              className={`${inputClass} mt-0 flex-1`}
            />
            <input
              type="number"
              value={row.quantity}
              min="0.25"
              step="0.25"
              onChange={(e) => updateRow(idx, { quantity: e.target.value })}
              placeholder="Qty"
              className={`${inputClass} mt-0 sm:w-24`}
            />
            <input
              type="number"
              value={row.unit_price}
              min="0"
              step="0.01"
              onChange={(e) => updateRow(idx, { unit_price: e.target.value })}
              placeholder={`Price (${currency})`}
              className={`${inputClass} mt-0 sm:w-36`}
            />
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((_, i) => i !== idx))}
                aria-label="Remove line"
                className="self-center text-slate-300 hover:text-red-500"
              >
                &times;
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          setRows((rs) => [...rs, { description: "", quantity: "1", unit_price: "" }])
        }
        className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-500"
      >
        + Add line
      </button>

      <div className="mt-4">
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-slate-700"
        >
          Notes <span className="text-slate-400">(payment details, terms...)</span>
        </label>
        <textarea id="notes" name="notes" rows={2} className={inputClass} />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Total:{" "}
          <span className="text-lg font-bold text-slate-900">
            {formatMoney(total, currency)}
          </span>
        </p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
        >
          {pending ? "Creating..." : "Create"}
        </button>
      </div>

      {state.error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
