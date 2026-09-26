import { requireUserAndBusiness } from "@/lib/data";
import { formatMoney } from "@/lib/types";

export const metadata = { title: "Tax Center" };

export default async function TaxPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const params = await searchParams;
  const currentYear = new Date().getFullYear();
  const year = /^\d{4}$/.test(params.year ?? "")
    ? Number(params.year)
    : currentYear;

  const { supabase, business } = await requireUserAndBusiness();
  const cur = business.currency;

  const { data: tx } = await supabase
    .from("transactions")
    .select("type, amount, receipt_path")
    .eq("business_id", business.id)
    .gte("date", `${year}-01-01`)
    .lte("date", `${year}-12-31`);

  const income = (tx ?? [])
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  const expenses = (tx ?? [])
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);
  const profit = income - expenses;
  const receiptCount = (tx ?? []).filter((t) => t.receipt_path).length;
  const txCount = (tx ?? []).length;

  const years = [currentYear, currentYear - 1, currentYear - 2];

  return (
    <div className="mx-auto max-w-6xl [&>*]:max-w-2xl">
      <h1 className="page-title">Tax Center</h1>
      <p className="page-sub">
        Everything your accountant needs for the year — in one download.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {years.map((y) => (
          <a
            key={y}
            href={`/tax?year=${y}`}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              y === year
                ? "bg-indigo-600 text-white"
                : "border border-slate-300 text-slate-600 hover:border-indigo-300"
            }`}
          >
            {y}
          </a>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {year} Income
          </p>
          <p className="mt-1 text-xl font-bold text-green-600">
            {formatMoney(income, cur)}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {year} Expenses
          </p>
          <p className="mt-1 text-xl font-bold text-red-600">
            {formatMoney(expenses, cur)}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {year} Profit
          </p>
          <p
            className={`mt-1 text-xl font-bold ${profit >= 0 ? "text-slate-900" : "text-red-600"}`}
          >
            {formatMoney(profit, cur)}
          </p>
        </div>
      </div>

      <div className="mt-6 card p-6">
        <h2 className="section-title">
          Download {year} records
        </h2>
        <p className="page-sub">
          {txCount} transaction{txCount === 1 ? "" : "s"} · {receiptCount}{" "}
          receipt{receiptCount === 1 ? "" : "s"} attached. The file is a
          spreadsheet (CSV) any accountant can open.
        </p>
        <a
          href={`/money/export?year=${year}`}
          className="mt-4 inline-block btn-primary"
        >
          ⬇ Download {year} income &amp; expenses
        </a>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Educational tool, not tax advice. Confirm what you owe with a local
        accountant — rules differ by country and state.
      </p>
    </div>
  );
}
