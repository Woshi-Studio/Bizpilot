"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from "@/lib/types";
import { createTransaction, type TransactionFormState } from "./actions";
import FormError from "@/components/form-error";

const initialState: TransactionFormState = {};

const inputClass =
  "input";

export default function TransactionComposer({
  customers,
}: {
  customers: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    createTransaction,
    initialState
  );
  const [type, setType] = useState<"income" | "expense">("income");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state]);

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <div className="card p-4">
      <div className="mb-3 inline-flex rounded-lg border border-slate-200 p-0.5">
        <button
          type="button"
          onClick={() => setType("income")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            type === "income"
              ? "bg-green-600 text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          + Income
        </button>
        <button
          type="button"
          onClick={() => setType("expense")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            type === "expense"
              ? "bg-red-600 text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          − Expense
        </button>
      </div>

      <form
        ref={formRef}
        action={formAction}
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
      >
        <input type="hidden" name="type" value={type} />
        <input
          type="number"
          name="amount"
          step="0.01"
          min="0.01"
          required
          placeholder="Amount"
          className={`${inputClass} sm:w-32`}
        />
        <select name="category" className={`${inputClass} sm:w-52`}>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          name="description"
          placeholder={
            type === "income"
              ? "e.g. Website project — John Smith"
              : "e.g. Figma subscription"
          }
          className={`${inputClass} flex-1`}
        />
        <select
          name="customer_id"
          defaultValue=""
          className={`${inputClass} sm:w-44`}
        >
          <option value="">No customer</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          className={`${inputClass} sm:w-40`}
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 btn-primary"
        >
          {pending ? "Adding..." : "Add"}
        </button>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              name="repeats_monthly"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Repeats monthly (subscriptions, rent, retainers)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span className="shrink-0">📎 Receipt:</span>
            <input
              type="file"
              name="receipt"
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
              className="text-xs text-slate-500 file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-600 hover:file:bg-slate-200"
            />
          </label>
        </div>
      </form>
      <FormError error={state.error} upgrade={state.upgrade} className="mt-2" />
    </div>
  );
}
