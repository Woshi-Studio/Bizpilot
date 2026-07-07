import Link from "next/link";
import { requireUserAndBusiness } from "@/lib/data";
import { formatMoney } from "@/lib/types";
import { scoreHealth } from "@/lib/health-score";

export const metadata = { title: "Reports" };

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

export default async function ReportsPage() {
  const { supabase, business } = await requireUserAndBusiness();
  const cur = business.currency;

  const now = new Date();
  const thisMonth = monthKey(now);
  const lastMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const today = now.toISOString().slice(0, 10);

  const [
    { data: recentTx },
    { data: incomeByCustomer },
    { data: overdueInvoices },
    { count: customerCount },
    { count: activeCount },
    { data: overdueFollowUpRows },
    leadsRes,
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("type, amount, date")
      .eq("business_id", business.id)
      .gte("date", sixMonthsAgo.toISOString().slice(0, 10)),
    supabase
      .from("transactions")
      .select("amount, customers(name)")
      .eq("business_id", business.id)
      .eq("type", "income")
      .not("customer_id", "is", null)
      .gte("date", `${now.getFullYear()}-01-01`),
    supabase
      .from("invoices")
      .select("id, number, customers(name)")
      .eq("business_id", business.id)
      .eq("doc_type", "invoice")
      .eq("status", "sent")
      .lt("due_date", today),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "active"),
    supabase
      .from("customers")
      .select("id")
      .eq("business_id", business.id)
      .lt("next_follow_up", today),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "new"),
  ]);

  // --- Monthly bars (last 6 months) ---
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    months.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  const byMonth = new Map<string, { income: number; expenses: number }>();
  months.forEach((m) => byMonth.set(m, { income: 0, expenses: 0 }));
  for (const t of recentTx ?? []) {
    const key = String(t.date).slice(0, 7);
    const bucket = byMonth.get(key);
    if (!bucket) continue;
    if (t.type === "income") bucket.income += Number(t.amount);
    else bucket.expenses += Number(t.amount);
  }
  const maxBar = Math.max(
    1,
    ...months.map((m) =>
      Math.max(byMonth.get(m)!.income, byMonth.get(m)!.expenses)
    )
  );

  const monthIncome = byMonth.get(thisMonth)?.income ?? 0;
  const monthExpenses = byMonth.get(thisMonth)?.expenses ?? 0;
  const lastMonthIncome = byMonth.get(lastMonth)?.income ?? 0;

  // --- Top customers this year ---
  const revByName = new Map<string, number>();
  for (const t of incomeByCustomer ?? []) {
    const c = t.customers as unknown as { name: string } | null;
    if (c?.name)
      revByName.set(c.name, (revByName.get(c.name) ?? 0) + Number(t.amount));
  }
  const topCustomers = [...revByName.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxCust = Math.max(1, ...topCustomers.map((c) => c[1]));

  // --- Health score ---
  const health = scoreHealth({
    monthIncome,
    monthExpenses,
    lastMonthIncome,
    customerCount: customerCount ?? 0,
    activeCustomerCount: activeCount ?? 0,
    overdueUnpaidCount: (overdueInvoices ?? []).length,
    overdueFollowUps: (overdueFollowUpRows ?? []).length,
    newLeads: leadsRes.error ? 0 : (leadsRes.count ?? 0),
    loggedThisMonth: monthIncome > 0 || monthExpenses > 0,
  });

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
      <p className="mt-1 text-sm text-slate-500">
        Your business at a glance — the numbers that matter, turned into
        decisions.
      </p>

      {/* Business Health Score */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-col items-center justify-center rounded-xl bg-slate-50 px-8 py-5">
            <span className={`text-4xl font-bold ${health.gradeClass}`}>
              {health.score}
            </span>
            <span className="text-xs text-slate-400">out of 100</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Business Health:{" "}
              <span className={health.gradeClass}>{health.grade}</span>
            </h2>
            <p className="mt-1 text-sm text-slate-500">{health.headline}</p>
          </div>
        </div>

        <ul className="mt-5 space-y-3">
          {health.factors.map((f) => (
            <li key={f.label}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">
                  {f.good ? "✅" : "⚠️"} {f.label}
                </span>
                <span className="text-xs text-slate-400">
                  {f.points}/{f.max}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${f.good ? "bg-green-500" : "bg-amber-500"}`}
                  style={{ width: `${(f.points / f.max) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">{f.note}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* Income vs expenses, last 6 months */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">
          Income &amp; expenses — last 6 months
        </h2>
        <div className="mt-5 flex items-end justify-between gap-3">
          {months.map((m) => {
            const b = byMonth.get(m)!;
            return (
              <div key={m} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-32 w-full items-end justify-center gap-1">
                  <div
                    className="w-1/2 rounded-t bg-green-500"
                    style={{ height: `${(b.income / maxBar) * 100}%` }}
                    title={`Income: ${formatMoney(b.income, cur)}`}
                  />
                  <div
                    className="w-1/2 rounded-t bg-red-400"
                    style={{ height: `${(b.expenses / maxBar) * 100}%` }}
                    title={`Expenses: ${formatMoney(b.expenses, cur)}`}
                  />
                </div>
                <span className="text-xs text-slate-400">{monthLabel(m)}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex justify-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500" /> Income
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-400" /> Expenses
          </span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Top customers */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">
            Top customers this year
          </h2>
          {topCustomers.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              Link income to customers to see who your best clients are.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {topCustomers.map(([name, amt]) => (
                <li key={name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{name}</span>
                    <span className="font-medium text-slate-800">
                      {formatMoney(amt, cur)}
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${(amt / maxCust) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Unpaid invoices */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">
            Needs chasing
          </h2>
          {(overdueInvoices ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              No overdue invoices — you&apos;re getting paid on time. 👍
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {(overdueInvoices ?? []).map((inv) => {
                const c = inv.customers as unknown as { name: string } | null;
                return (
                  <li key={inv.id}>
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
                    >
                      <span className="text-slate-700">
                        {inv.number}
                        {c ? ` · ${c.name}` : ""}
                      </span>
                      <span className="text-xs font-medium text-red-600">
                        overdue
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
