import { requireUserAndBusiness } from "@/lib/data";
import { formatMoney, type Business, type Win } from "@/lib/types";
import GoalsForm from "./goals-form";
import WinsPanel from "./wins-panel";

export const metadata = { title: "Goals & Wins" };

function ProgressBar({ pct }: { pct: number }) {
  const width = Math.min(100, Math.max(0, pct));
  return (
    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-indigo-500 transition-all"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export default async function GoalsPage() {
  const { supabase, business } = await requireUserAndBusiness();
  const b = business as Business;
  const cur = business.currency;

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [{ count: activeCount }, { data: monthIncome }, { data: wins }] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id)
        .eq("status", "active"),
      supabase
        .from("transactions")
        .select("amount")
        .eq("business_id", business.id)
        .eq("type", "income")
        .gte("date", monthStart),
      supabase
        .from("wins")
        .select("*")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false }),
    ]);

  const revenueThisMonth = (monthIncome ?? []).reduce(
    (s, t) => s + Number(t.amount),
    0
  );

  const customerPct = b.goal_customers
    ? ((activeCount ?? 0) / b.goal_customers) * 100
    : 0;
  const revenuePct = b.goal_monthly_revenue
    ? (revenueThisMonth / b.goal_monthly_revenue) * 100
    : 0;
  const savingsPct =
    b.savings_target && b.savings_target > 0
      ? ((b.savings_current ?? 0) / b.savings_target) * 100
      : 0;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold text-slate-900">Goals & Wins</h1>
      <p className="mt-1 text-sm text-slate-500">
        What you&apos;re aiming for, and proof you&apos;re getting there.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {(b.goal_customers || b.goal_monthly_revenue || b.savings_target) && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800">
                Progress
              </h2>
              {b.goal_customers && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Active customers</span>
                    <span className="font-medium text-indigo-600">
                      {activeCount ?? 0} / {b.goal_customers}
                    </span>
                  </div>
                  <ProgressBar pct={customerPct} />
                </div>
              )}
              {b.goal_monthly_revenue && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Revenue this month</span>
                    <span className="font-medium text-indigo-600">
                      {formatMoney(revenueThisMonth, cur)} /{" "}
                      {formatMoney(b.goal_monthly_revenue, cur)}
                    </span>
                  </div>
                  <ProgressBar pct={revenuePct} />
                </div>
              )}
              {b.savings_target && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">
                      {b.savings_goal_label || "Savings goal"}
                    </span>
                    <span className="font-medium text-indigo-600">
                      {formatMoney(b.savings_current ?? 0, cur)} /{" "}
                      {formatMoney(b.savings_target, cur)}
                    </span>
                  </div>
                  <ProgressBar pct={savingsPct} />
                </div>
              )}
            </div>
          )}
          <GoalsForm business={b} />
        </div>

        <WinsPanel wins={(wins ?? []) as Win[]} />
      </div>
    </div>
  );
}
