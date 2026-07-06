import Link from "next/link";
import { requireUserAndBusiness } from "@/lib/data";
import { formatMoney } from "@/lib/types";
import DailyPlan from "./daily-plan";

export const metadata = { title: "Dashboard" };

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const { supabase, user, business } = await requireUserAndBusiness();
  const today = new Date().toISOString().slice(0, 10);

  const monthStart = `${today.slice(0, 7)}-01`;

  const [
    { data: profile },
    { data: dueTasks },
    { data: followUps },
    { count: customerCount },
    { data: monthTransactions },
    { count: taskCount },
    { count: transactionCount },
    { count: decisionCount },
    { data: overdueInvoices },
    { data: noFollowUpCustomers },
    leadsResult,
    { data: incomeByCustomer },
  ] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("tasks")
        .select("id, title, due_date, customers(id, name)")
        .eq("business_id", business.id)
        .is("completed_at", null)
        .lte("due_date", today)
        .order("due_date")
        .limit(5),
      supabase
        .from("customers")
        .select("id, name, next_follow_up")
        .eq("business_id", business.id)
        .lte("next_follow_up", today)
        .order("next_follow_up")
        .limit(5),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id),
      supabase
        .from("transactions")
        .select("type, amount")
        .eq("business_id", business.id)
        .gte("date", monthStart),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id),
      supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id),
      supabase
        .from("decisions")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id),
      supabase
        .from("invoices")
        .select("id, number, due_date, customers(name)")
        .eq("business_id", business.id)
        .eq("doc_type", "invoice")
        .eq("status", "sent")
        .lt("due_date", today)
        .limit(3),
      supabase
        .from("customers")
        .select("id, name")
        .eq("business_id", business.id)
        .eq("status", "active")
        .is("next_follow_up", null)
        .limit(3),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id)
        .eq("status", "new"),
      supabase
        .from("transactions")
        .select("amount, customers(name)")
        .eq("business_id", business.id)
        .eq("type", "income")
        .not("customer_id", "is", null)
        .gte("date", `${today.slice(0, 4)}-01-01`),
    ]);

  const firstName = (profile?.full_name ?? "").split(" ")[0] || "there";
  const tasks = dueTasks ?? [];
  const reminders = followUps ?? [];

  const txs = monthTransactions ?? [];
  const monthIncome = txs
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const monthExpenses = txs
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const monthProfit = monthIncome - monthExpenses;

  // Autopilot: things the app noticed on its own
  const newLeadCount = leadsResult.error ? 0 : (leadsResult.count ?? 0);
  const revenueByName = new Map<string, number>();
  for (const t of incomeByCustomer ?? []) {
    const cust = t.customers as unknown as { name: string } | null;
    if (cust?.name) {
      revenueByName.set(
        cust.name,
        (revenueByName.get(cust.name) ?? 0) + Number(t.amount)
      );
    }
  }
  const topCustomer = [...revenueByName.entries()].sort(
    (a, b) => b[1] - a[1]
  )[0];

  const autopilotItems: { emoji: string; text: string; href: string }[] = [];
  for (const inv of overdueInvoices ?? []) {
    const cust = inv.customers as unknown as { name: string } | null;
    autopilotItems.push({
      emoji: "⏰",
      text: `Invoice ${inv.number}${cust ? ` (${cust.name})` : ""} was due ${inv.due_date} and isn't paid — time to chase it.`,
      href: `/invoices/${inv.id}`,
    });
  }
  for (const c of noFollowUpCustomers ?? []) {
    autopilotItems.push({
      emoji: "👋",
      text: `${c.name} is an active customer with no follow-up planned — set one so they don't drift away.`,
      href: `/customers/${c.id}`,
    });
  }
  if (newLeadCount > 0) {
    autopilotItems.push({
      emoji: "📥",
      text: `${newLeadCount} new lead${newLeadCount === 1 ? "" : "s"} waiting in your inbox.`,
      href: "/leads",
    });
  }
  if (topCustomer && topCustomer[1] > 0) {
    autopilotItems.push({
      emoji: "💡",
      text: `${topCustomer[0]} is your biggest customer this year (${formatMoney(topCustomer[1], business.currency)}). Keep them close.`,
      href: "/customers",
    });
  }

  const checklist = [
    {
      label: "Add your first customer",
      href: "/customers/new",
      done: (customerCount ?? 0) > 0,
    },
    {
      label: "Add a task for today",
      href: "/tasks",
      done: (taskCount ?? 0) > 0,
    },
    {
      label: "Log an income or expense",
      href: "/money",
      done: (transactionCount ?? 0) > 0,
    },
    {
      label: "Run a decision through Decision Guard",
      href: "/decisions",
      done: (decisionCount ?? 0) > 0,
    },
  ];
  const showChecklist = checklist.some((c) => !c.done);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-900">
        {greeting()}, {firstName} 👋
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {tasks.length + reminders.length > 0
          ? `You have ${tasks.length} task${tasks.length === 1 ? "" : "s"} due and ${reminders.length} follow-up${reminders.length === 1 ? "" : "s"} waiting.`
          : "You're all caught up. Nice."}
      </p>

      {showChecklist && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">
            🚀 Getting started
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Set up your hub in a few minutes — each step unlocks more of the
            dashboard.
          </p>
          <ul className="mt-3 space-y-2">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-center gap-2 text-sm">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                    item.done
                      ? "bg-green-500 text-white"
                      : "border border-slate-300 text-transparent"
                  }`}
                >
                  ✓
                </span>
                {item.done ? (
                  <span className="text-slate-400 line-through">
                    {item.label}
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    className="text-slate-700 hover:text-indigo-600"
                  >
                    {item.label} &rarr;
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={showChecklist ? "mt-4" : "mt-8"}>
        <DailyPlan />
      </div>

      {autopilotItems.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">
            🤖 Autopilot noticed
          </h2>
          <ul className="mt-3 space-y-2">
            {autopilotItems.map((item, i) => (
              <li key={i}>
                <Link
                  href={item.href}
                  className="-mx-2 flex items-start gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span>{item.emoji}</span>
                  <span>{item.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Today's tasks */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              Today&apos;s Tasks
            </h2>
            <Link
              href="/tasks"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
            >
              All tasks &rarr;
            </Link>
          </div>
          {tasks.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              Nothing due today.{" "}
              <Link href="/tasks" className="text-indigo-600 hover:underline">
                Plan your day
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {tasks.map((t) => {
                const overdue = t.due_date && t.due_date < today;
                return (
                  <li key={t.id} className="text-sm">
                    <Link
                      href="/tasks"
                      className="block rounded-md px-2 py-1.5 -mx-2 hover:bg-slate-50"
                    >
                      <span className="text-slate-700">{t.title}</span>
                      {overdue && (
                        <span className="ml-2 text-xs font-medium text-red-600">
                          overdue
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Follow-ups */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              Customer Follow-ups
            </h2>
            <Link
              href="/customers"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
            >
              All customers &rarr;
            </Link>
          </div>
          {reminders.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              No follow-ups due.{" "}
              {customerCount === 0 ? (
                <Link
                  href="/customers/new"
                  className="text-indigo-600 hover:underline"
                >
                  Add your first customer
                </Link>
              ) : (
                "You're on top of your clients."
              )}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {reminders.map((c) => {
                const overdue = c.next_follow_up && c.next_follow_up < today;
                return (
                  <li key={c.id} className="text-sm">
                    <Link
                      href={`/customers/${c.id}`}
                      className="block rounded-md px-2 py-1.5 -mx-2 hover:bg-slate-50"
                    >
                      <span className="text-slate-700">{c.name}</span>
                      <span
                        className={`ml-2 text-xs font-medium ${overdue ? "text-red-600" : "text-amber-600"}`}
                      >
                        {overdue ? `since ${c.next_follow_up}` : "today"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Money snapshot (this month) */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              Money Snapshot
            </h2>
            <Link
              href="/money"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
            >
              Details &rarr;
            </Link>
          </div>
          {txs.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              Nothing logged this month.{" "}
              <Link href="/money" className="text-indigo-600 hover:underline">
                Add income or expenses
              </Link>
              .
            </p>
          ) : (
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Income</dt>
                <dd className="font-semibold text-green-600">
                  {formatMoney(monthIncome, business.currency)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Expenses</dt>
                <dd className="font-semibold text-red-600">
                  {formatMoney(monthExpenses, business.currency)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-1.5">
                <dt className="font-medium text-slate-700">Profit</dt>
                <dd
                  className={`font-bold ${monthProfit >= 0 ? "text-slate-900" : "text-red-600"}`}
                >
                  {formatMoney(monthProfit, business.currency)}
                </dd>
              </div>
            </dl>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-400">
        {customerCount ?? 0} customer{(customerCount ?? 0) === 1 ? "" : "s"} in
        your hub
      </p>
    </div>
  );
}
