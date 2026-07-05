import Link from "next/link";
import { requireUserAndBusiness } from "@/lib/data";
import {
  categoryLabel,
  formatMoney,
  type Transaction,
} from "@/lib/types";
import TransactionComposer from "./transaction-composer";
import { deleteTransaction } from "./actions";

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

  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("business_id", business.id)
    .gte("date", start)
    .lt("date", next)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  const transactions = (data ?? []) as Transaction[];
  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const expenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const profit = income - expenses;
  const cur = business.currency;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Money</h1>
          <p className="mt-1 text-sm text-slate-500">
            Income, expenses, and what&apos;s left over.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/money?month=${shiftMonth(month, -1)}`}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            aria-label="Previous month"
          >
            &larr;
          </Link>
          <span className="min-w-32 text-center text-sm font-semibold text-slate-800">
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
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Income
          </p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            {formatMoney(income, cur)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Expenses
          </p>
          <p className="mt-1 text-2xl font-bold text-red-600">
            {formatMoney(expenses, cur)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
        <TransactionComposer />
      </div>

      <div className="mt-6">
        {transactions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
            Nothing logged for {monthTitle(month)} yet. Add your first income
            or expense above.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {transactions.map((t) => (
              <li
                key={t.id}
                className="group flex items-center gap-3 px-5 py-3"
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
                  </p>
                </div>
                <form action={deleteTransaction}>
                  <input type="hidden" name="id" value={t.id} />
                  <button
                    type="submit"
                    aria-label="Delete transaction"
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
    </div>
  );
}
