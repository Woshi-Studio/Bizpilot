import Link from "next/link";
import { requireUserAndBusiness } from "@/lib/data";
import { applyDueRecurring } from "@/lib/recurring";
import {
  categoryLabel,
  formatMoney,
  type Transaction,
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
} from "@/lib/types";
import TransactionComposer from "./transaction-composer";
import { deleteTransaction, deleteRecurring, updateTransaction, updateRecurring } from "./actions";
import EditableRow from "@/components/editable-row";

export const metadata = { title: "Money" };

function monthBounds(month: string) {
  // month = "YYYY-MM"
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const next =
    m === 12
      ? `${y + 1}-01-01`
      : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start, next };
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? params.month!
    : currentMonth;
  const { start, next } = monthBounds(month);

  const { supabase, business } = await requireUserAndBusiness();

  // Materialize any recurring transactions that came due
  await applyDueRecurring(supabase, business.id);

  const [{ data }, { data: customers }, { data: recurring }] =
    await Promise.all([
    supabase
      .from("transactions")
      .select("*, customers(name)")
      .eq("business_id", business.id)
      .gte("date", start)
      .lt("date", next)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("customers")
      .select("id, name")
      .eq("business_id", business.id)
      .order("name"),
    supabase
      .from("recurring_transactions")
      .select("id, type, amount, category, description, next_date")
      .eq("business_id", business.id)
      .order("next_date"),
  ]);

  const transactions = (data ?? []) as (Transaction & {
    customers: { name: string } | null;
  })[];

  // Signed URLs for attached receipts (valid 1 hour)
  const receiptUrls = new Map<string, string>();
  const withReceipts = transactions.filter((t) => t.receipt_path);
  if (withReceipts.length > 0) {
    const { data: signed } = await supabase.storage
      .from("receipts")
      .createSignedUrls(
        withReceipts.map((t) => t.receipt_path!),
        3600
      );
    signed?.forEach((s, i) => {
      if (s.signedUrl) receiptUrls.set(withReceipts[i].id, s.signedUrl);
    });
  }
  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const expenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const profit = income - expenses;
  const cur = business.currency;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Money</h1>
          <p className="page-sub">
            Income, expenses, and what&apos;s left over.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/money/export?year=${month.slice(0, 4)}`}
            className="btn-secondary"
          >
            ⬇ Export {month.slice(0, 4)}
          </a>
          <Link
            href={`/money?month=${shiftMonth(month, -1)}`}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            aria-label="Previous month"
          >
            &larr;
          </Link>
          <span className="min-w-32 text-center section-title">
            {monthTitle(month)}
          </span>
          {month < currentMonth ? (
            <Link
              href={`/money?month=${shiftMonth(month, 1)}`}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              aria-label="Next month"
            >
              &rarr;
            </Link>
          ) : (
            <span className="rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-300">
              &rarr;
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Income
          </p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            {formatMoney(income, cur)}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Expenses
          </p>
          <p className="mt-1 text-2xl font-bold text-red-600">
            {formatMoney(expenses, cur)}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Profit
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${profit >= 0 ? "text-slate-900" : "text-red-600"}`}
          >
            {formatMoney(profit, cur)}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <TransactionComposer customers={customers ?? []} />
      </div>

      {(recurring ?? []).length > 0 && (
        <div className="mt-6">
          <h2 className="section-title">
            🔁 Recurring monthly
          </h2>
          <ul className="mt-2 divide-y divide-slate-100 overflow-hidden card">
            {(recurring ?? []).map((r) => (
              <EditableRow
                key={r.id}
                id={r.id}
                className="px-5 py-2.5"
                updateAction={updateRecurring}
                deleteAction={deleteRecurring}
                what="this monthly repeat (past entries stay)"
                fields={[
                  { name: "amount", label: `Amount (${cur})`, type: "number", step: "0.01", defaultValue: r.amount, required: true },
                  { name: "next_date", label: "Next on", type: "date", defaultValue: r.next_date, required: true },
                  { name: "description", label: "Description", type: "text", defaultValue: r.description },
                ]}
              >
                <span
                  className={`w-24 shrink-0 text-sm font-semibold ${
                    r.type === "income" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {r.type === "income" ? "+" : "−"}
                  {formatMoney(Number(r.amount), cur)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-700">
                    {r.description || categoryLabel(r.category)}
                  </p>
                  <p className="text-xs text-slate-400">
                    next on {r.next_date}
                  </p>
                </div>
              </EditableRow>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        {transactions.length === 0 ? (
          <p className="card-empty p-8 text-center text-sm text-slate-400">
            Nothing logged for {monthTitle(month)} yet. Add your first income
            or expense above.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden card">
            {transactions.map((t) => (
              <EditableRow
                key={t.id}
                id={t.id}
                className="px-5 py-3"
                updateAction={updateTransaction}
                deleteAction={deleteTransaction}
                what={`this ${t.type === "income" ? "income" : "expense"}`}
                fields={[
                  { name: "amount", label: `Amount (${cur})`, type: "number", step: "0.01", defaultValue: t.amount, required: true },
                  { name: "date", label: "Date", type: "date", defaultValue: t.date, required: true },
                  {
                    name: "category",
                    label: "Category",
                    type: "select",
                    defaultValue: t.category,
                    options: (t.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => ({ value: c.value, label: c.label })),
                  },
                  { name: "description", label: "Description", type: "text", defaultValue: t.description, wide: true },
                ]}
              >
                <span
                  className={`w-24 shrink-0 text-sm font-semibold ${
                    t.type === "income" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {t.type === "income" ? "+" : "−"}
                  {formatMoney(Number(t.amount), cur)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-700">
                    {t.description || categoryLabel(t.category)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {categoryLabel(t.category)} · {t.date}
                    {t.customers ? ` · ${t.customers.name}` : ""}
                    {receiptUrls.has(t.id) && (
                      <>
                        {" · "}
                        <a
                          href={receiptUrls.get(t.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-500 hover:text-indigo-600"
                        >
                          📎 receipt
                        </a>
                      </>
                    )}
                  </p>
                </div>
              </EditableRow>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
