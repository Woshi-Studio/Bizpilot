import Link from "next/link";
import { requireUserAndBusiness } from "@/lib/data";
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

  const [{ data: profile }, { data: dueTasks }, { data: followUps }, { count: customerCount }] =
    await Promise.all([
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
    ]);

  const firstName = (profile?.full_name ?? "").split(" ")[0] || "there";
  const tasks = dueTasks ?? [];
  const reminders = followUps ?? [];

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

      <div className="mt-8">
        <DailyPlan />
      </div>

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

        {/* Money placeholder (Phase 5) */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">
            Money Snapshot
          </h2>
          <p className="mt-3 text-sm font-medium text-slate-600">
            No income or expenses logged.
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Simple money tracking is on the way — monthly totals and profit
            estimates will live here.
          </p>
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-400">
        {customerCount ?? 0} customer{(customerCount ?? 0) === 1 ? "" : "s"} in
        your hub
      </p>
    </div>
  );
}
