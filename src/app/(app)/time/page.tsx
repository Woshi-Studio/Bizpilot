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
    <div className="mx-auto max-w-6xl">
      <h1 className="page-title">Time & Billing</h1>
      <p className="page-sub">
        Log hours against a customer or task, and keep track of what&apos;s still
        unbilled.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4">
        <div className="card px-2 py-4 text-center shadow-sm sm:p-5">
          <p className="text-2xl font-bold text-slate-900 sm:text-3xl">{weekHours}h</p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400 sm:text-xs">
            This week
          </p>
        </div>
        <div className="card px-2 py-4 text-center shadow-sm sm:p-5">
          <p className="text-2xl font-bold text-amber-600 sm:text-3xl">
            {unbilledHours}h
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400 sm:text-xs">
            Unbilled hours
          </p>
        </div>
        <div className="card px-2 py-4 text-center shadow-sm sm:p-5">
          <p className="text-2xl font-bold text-slate-900 sm:text-3xl">
            {(activeCustomers ?? []).length}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400 sm:text-xs">
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
