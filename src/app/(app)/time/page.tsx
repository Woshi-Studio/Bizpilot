import { requireUserAndBusiness } from "@/lib/data";
import type { TimeEntry } from "@/lib/types";
import TimeForm from "./time-form";
import TimeList from "./time-list";

export const metadata = { title: "Time & Billing" };

export default async function TimePage() {
  const { supabase, business } = await requireUserAndBusiness();

  const [{ data: entries }, { data: customers }, { data: tasks }] =
    await Promise.all([
      supabase
        .from("time_entries")
        .select("*")
        .eq("business_id", business.id)
        .order("entry_date", { ascending: false }),
      supabase
        .from("customers")
        .select("id, name")
        .eq("business_id", business.id)
        .order("name"),
      supabase
        .from("tasks")
        .select("id, title, customer_id")
        .eq("business_id", business.id)
        .order("title"),
    ]);

  const timeEntries = (entries ?? []) as TimeEntry[];
  const customerList = customers ?? [];
  const taskList = tasks ?? [];

  const customerNames = Object.fromEntries(
    customerList.map((c) => [c.id, c.name])
  );
  const taskTitles = Object.fromEntries(taskList.map((t) => [t.id, t.title]));

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  const weekHours = timeEntries
    .filter((e) => e.entry_date >= weekStartStr)
    .reduce((s, e) => s + Number(e.hours), 0);
  const unbilledHours = timeEntries
    .filter((e) => e.billed === "unbilled")
    .reduce((s, e) => s + Number(e.hours), 0);

  const { data: activeCustomers } = await supabase
    .from("customers")
    .select("id")
    .eq("business_id", business.id)
    .eq("status", "active");

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-900">Time & Billing</h1>
      <p className="mt-1 text-sm text-slate-500">
        Log hours against a customer or task, and keep track of what&apos;s still
        unbilled.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm">
          <p className="text-2xl font-bold text-slate-900">{weekHours}h</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
            This week
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm">
          <p className="text-2xl font-bold text-amber-600">
            {unbilledHours}h
          </p>
          <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
            Unbilled hours
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm">
          <p className="text-2xl font-bold text-slate-900">
            {(activeCustomers ?? []).length}
          </p>
          <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
            Active customers
          </p>
        </div>
      </div>

      <div className="mt-6">
        <TimeForm customers={customerList} tasks={taskList} />
      </div>

      <div className="mt-6">
        <TimeList
          entries={timeEntries}
          customerNames={customerNames}
          taskTitles={taskTitles}
        />
      </div>
    </div>
  );
}
