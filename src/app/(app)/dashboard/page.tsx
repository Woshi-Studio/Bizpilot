import AiCreditMeter from "@/components/ai-credit-meter";
import Link from "next/link";
import Greeting from "@/components/greeting";
import Icon, { type IconName } from "@/components/icons";
import { requireUserAndBusiness } from "@/lib/data";
import { formatMoney } from "@/lib/types";
import DailyPlan from "./daily-plan";
import Scoreboard, { type DueItem, type ScoreRow } from "./scoreboard";
import BusinessLineFilter from "@/components/business-line-filter";
import { loadBusinessLines, withLine } from "@/lib/activities";
import { NO_LINE, lineFromParam } from "@/lib/business-lines";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ line?: string }>;
}) {
  const { supabase, user, business } = await requireUserAndBusiness();
  const today = new Date().toISOString().slice(0, 10);
  const line = lineFromParam((await searchParams).line);

  const monthStart = `${today.slice(0, 7)}-01`;

  // Plain-string column lists keep the filtered query types simple.
  const cols = (c: string) => c;
  const dueTasksQuery = withLine(
    supabase
      .from("tasks")
      .select(cols("id, title, due_date"))
      .eq("business_id", business.id),
    line
  )
    .is("completed_at", null)
    .lte("due_date", today)
    .order("due_date")
    .limit(5);
  const followUpsQuery = withLine(
    supabase
      .from("customers")
      .select(cols("id, name, next_follow_up"))
      .eq("business_id", business.id),
    line
  )
    .lte("next_follow_up", today)
    .order("next_follow_up")
    .limit(5);

  const [
    { data: profile },
    { data: dueTasksData },
    { data: followUpsData },
    { count: customerCount },
    { data: monthTransactions },
    { count: taskCount },
    { count: transactionCount },
    { count: decisionCount },
    { data: overdueInvoices },
    { data: noFollowUpCustomers },
    leadsResult,
    { data: incomeByCustomer },
    scoreResult,
    dueLeadsResult,
    dueCustomersResult,
    lines,
  ] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle(),
      dueTasksQuery,
      followUpsQuery,
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
      supabase.rpc("owner_hub_scoreboard", { p_business: business.id }),
      supabase
        .from("leads")
        .select("id, name, follow_up_date, business_line")
        .eq("business_id", business.id)
        .lte("follow_up_date", today)
        .not("status", "in", "(converted,declined)")
        .order("follow_up_date")
        .limit(300),
      supabase
        .from("customers")
        .select("id, name, next_follow_up, business_line")
        .eq("business_id", business.id)
        .lte("next_follow_up", today)
        .order("next_follow_up")
        .limit(300),
      loadBusinessLines(supabase, business.id),
    ]);

  // Scoreboard: one card per business line (or just the chosen one)
  const scoreMissing = !!scoreResult.error;
  const scoreRows = (scoreResult.data ?? []) as ScoreRow[];
  const dueItems: DueItem[] = [
    ...((dueLeadsResult.data ?? []) as {
      id: string;
      name: string;
      follow_up_date: string;
      business_line: string | null;
    }[]).map((l) => ({
      id: l.id,
      name: l.name,
      date: l.follow_up_date,
      href: `/leads/${l.id}`,
      line: l.business_line,
      kind: "lead" as const,
    })),
    ...((dueCustomersResult.data ?? []) as {
      id: string;
      name: string;
      next_follow_up: string;
      business_line: string | null;
    }[]).map((c) => ({
      id: c.id,
      name: c.name,
      date: c.next_follow_up,
      href: `/customers/${c.id}`,
      line: c.business_line,
      kind: "customer" as const,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const scoreLines: (string | null)[] = line
    ? [line === NO_LINE ? null : line]
    : [...lines, null];

  const dueTasks = (dueTasksData ?? []) as unknown as {
    id: string;
    title: string;
    due_date: string | null;
  }[];
  const followUps = (followUpsData ?? []) as unknown as {
    id: string;
    name: string;
    next_follow_up: string | null;
  }[];
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

  const dueCount = tasks.length + reminders.length;
  const stats: {
    label: string;
    value: string;
    hint: string;
    icon: IconName;
    href: string;
    tone?: string;
  }[] = [
    {
      label: "Income this month",
      value: formatMoney(monthIncome, business.currency),
      hint: `${formatMoney(monthExpenses, business.currency)} spent`,
      icon: "money",
      href: "/money",
    },
    {
      label: "Profit this month",
      value: formatMoney(monthProfit, business.currency),
      hint: monthProfit >= 0 ? "You're in the green" : "Spending more than earning",
      icon: "sparkle",
      href: "/reports",
      tone: monthProfit >= 0 ? "text-green-600" : "text-red-600",
    },
    {
      label: "Due today",
      value: String(dueCount),
      hint: `${tasks.length} task${tasks.length === 1 ? "" : "s"} · ${reminders.length} follow-up${reminders.length === 1 ? "" : "s"}`,
      icon: "check",
      href: "/tasks",
    },
    {
      label: "New leads",
      value: String(newLeadCount),
      hint: `${customerCount ?? 0} customer${(customerCount ?? 0) === 1 ? "" : "s"} in your hub`,
      icon: "people",
      href: "/leads",
    },
  ];
  const doneSteps = checklist.filter((c) => c.done).length;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="page-title">
            <Greeting name={firstName} />
          </h1>
          <p className="page-sub">
            {dueCount > 0
              ? `You have ${tasks.length} task${tasks.length === 1 ? "" : "s"} due and ${reminders.length} follow-up${reminders.length === 1 ? "" : "s"} waiting.`
              : "You're all caught up. Nice."}{" "}
            <Link href="/reports" className="link whitespace-nowrap">
              Health score →
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/customers/new" className="btn-secondary btn-sm">
            <Icon name="people" className="h-4 w-4" /> Add customer
          </Link>
          <Link href="/tasks" className="btn-secondary btn-sm">
            <Icon name="check" className="h-4 w-4" /> Add task
          </Link>
          <Link href="/invoices/new" className="btn-primary btn-sm">
            <Icon name="plus" className="h-4 w-4" /> New invoice
          </Link>
        </div>
      </div>

      <div className="mt-6">
        <BusinessLineFilter basePath="/dashboard" lines={lines} current={line} />
      </div>

      {/* KPI row */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card card-hover block p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium text-muted sm:text-sm">{s.label}</span>
              <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text sm:flex">
                <Icon name={s.icon} className="h-4 w-4" />
              </span>
            </div>
            <p className={`mt-2 text-xl font-semibold tracking-tight sm:text-2xl ${s.tone ?? "text-ink"}`}>
              {s.value}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted">{s.hint}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left: what to do */}
        <div className="space-y-5 lg:col-span-2">
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="section-title">Today</h2>
              <div className="flex gap-3 text-sm">
                <Link href="/tasks" className="link">Tasks</Link>
                <Link href="/customers" className="link">Customers</Link>
              </div>
            </div>
            {dueCount === 0 ? (
              <div className="mt-4 rounded-2xl bg-surface-2 px-5 py-8 text-center">
                <p className="text-sm font-medium text-ink">Nothing due today 🎉</p>
                <p className="mt-1 text-sm text-muted">
                  {customerCount === 0 ? (
                    <Link href="/customers/new" className="link">Add your first customer</Link>
                  ) : (
                    <>
                      Plan ahead on the <Link href="/tasks" className="link">Tasks</Link> page.
                    </>
                  )}
                </p>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-line/60">
                {tasks.map((t) => {
                  const overdue = t.due_date && t.due_date < today;
                  return (
                    <li key={t.id}>
                      <Link
                        href="/tasks"
                        className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-surface-2"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
                          <Icon name="check" className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{t.title}</span>
                        <span className={`shrink-0 text-xs font-medium ${overdue ? "text-red-600" : "text-muted"}`}>
                          {overdue ? `Overdue · ${t.due_date}` : "Today"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
                {reminders.map((c) => {
                  const overdue = c.next_follow_up && c.next_follow_up < today;
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/customers/${c.id}`}
                        className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-surface-2"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                          <Icon name="phone" className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                          Follow up with {c.name}
                        </span>
                        <span className={`shrink-0 text-xs font-medium ${overdue ? "text-red-600" : "text-amber-600"}`}>
                          {overdue ? `Since ${c.next_follow_up}` : "Today"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {autopilotItems.length > 0 && (
            <div className="card p-5 sm:p-6">
              <h2 className="section-title">Jephelen noticed</h2>
              <ul className="mt-3 space-y-1">
                {autopilotItems.map((item, i) => (
                  <li key={i}>
                    <Link
                      href={item.href}
                      className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-2.5 text-sm text-ink-2 transition-colors hover:bg-surface-2"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-base">
                        {item.emoji}
                      </span>
                      <span className="pt-1.5">{item.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right: AI plan, money, setup */}
        <div className="space-y-5">
          <div>
            <DailyPlan />
            <AiCreditMeter className="mt-2 px-1" />
          </div>

          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="section-title">Money this month</h2>
              <Link href="/money" className="link text-sm">Details</Link>
            </div>
            {txs.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                Nothing logged yet. <Link href="/money" className="link">Add income or expenses</Link>
              </p>
            ) : (
              <>
                <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="bg-green-500"
                    style={{
                      width: `${monthIncome + monthExpenses > 0 ? (monthIncome / (monthIncome + monthExpenses)) * 100 : 0}%`,
                    }}
                  />
                  <div className="flex-1 bg-red-400/70" />
                </div>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="flex items-center gap-2 text-muted">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      Income
                    </dt>
                    <dd className="font-semibold text-ink">{formatMoney(monthIncome, business.currency)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="flex items-center gap-2 text-muted">
                      <span className="h-2 w-2 rounded-full bg-red-400" />
                      Expenses
                    </dt>
                    <dd className="font-semibold text-ink">{formatMoney(monthExpenses, business.currency)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-line/70 pt-2">
                    <dt className="font-medium text-ink">Profit</dt>
                    <dd className={`font-semibold ${monthProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatMoney(monthProfit, business.currency)}
                    </dd>
                  </div>
                </dl>
              </>
            )}
          </div>

          {showChecklist && (
            <div className="card p-5 sm:p-6">
              <h2 className="section-title">Getting started</h2>
              <p className="mt-1 text-sm text-muted">
                {doneSteps} of {checklist.length} done
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${(doneSteps / checklist.length) * 100}%` }}
                />
              </div>
              <ul className="mt-4 space-y-2.5">
                {checklist.map((item) => (
                  <li key={item.label} className="flex items-center gap-2.5 text-sm">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                        item.done ? "bg-green-500 text-white" : "border border-line text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    {item.done ? (
                      <span className="text-subtle line-through">{item.label}</span>
                    ) : (
                      <Link href={item.href} className="font-medium text-ink hover:text-accent-text">
                        {item.label} →
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">Scoreboard by business</h2>
          <Link href="/leads" className="link text-sm">All leads</Link>
        </div>
        <Scoreboard
          rows={scoreRows}
          due={dueItems}
          lines={scoreLines}
          today={today}
          missing={scoreMissing}
        />
      </div>
    </div>
  );
}
