import { requireUserAndBusiness } from "@/lib/data";
import TaskComposer from "./task-composer";
import TaskRow, { type TaskWithCustomer } from "./task-row";

export const metadata = { title: "Tasks" };

export default async function TasksPage() {
  const { supabase, business } = await requireUserAndBusiness();

  const [{ data: tasks }, { data: customers }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, due_date, completed_at, customers(id, name)")
      .eq("business_id", business.id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("customers")
      .select("id, name")
      .eq("business_id", business.id)
      .order("name"),
  ]);

  const allTasks = (tasks ?? []) as unknown as TaskWithCustomer[];
  const openTasks = allTasks.filter((t) => !t.completed_at);
  const doneTasks = allTasks.filter((t) => t.completed_at).slice(0, 15);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
      <p className="mt-1 text-sm text-slate-500">
        Your daily action list — small steps, every day.
      </p>

      <div className="mt-6">
        <TaskComposer customers={customers ?? []} />
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-slate-800">
          Open ({openTasks.length})
        </h2>
        {openTasks.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
            Nothing open. Add a task above — even &quot;follow up with one
            customer&quot; counts.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {openTasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        )}
      </div>

      {doneTasks.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-slate-400">
            Recently completed
          </h2>
          <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {doneTasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
