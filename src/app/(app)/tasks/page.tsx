import { requireUserAndBusiness } from "@/lib/data";
import { loadPickableServices } from "@/lib/services-data";
import TaskComposer from "./task-composer";
import TaskRow, { type TaskWithCustomer } from "./task-row";
import BusinessLineFilter from "@/components/business-line-filter";
import { loadBusinessLines, withLine } from "@/lib/activities";
import { NO_LINE, lineFromParam } from "@/lib/business-lines";

const isId = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);

export const metadata = { title: "Tasks" };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ line?: string; customer?: string }>;
}) {
  const { supabase, business } = await requireUserAndBusiness();
  const params = await searchParams;
  const line = lineFromParam(params.line);

  const TASK_COLUMNS: string =
    "id, title, description, value, status, due_date, completed_at, business_line, customers(id, name)";
  const tasksQuery = withLine(
    supabase.from("tasks").select(TASK_COLUMNS).eq("business_id", business.id),
    line
  )
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const [{ data: tasks }, { data: customers }, { data: services }, lines] =
    await Promise.all([
      tasksQuery,
      supabase
        .from("customers")
        .select("id, name")
        .eq("business_id", business.id)
        .order("name"),
      loadPickableServices(supabase, business.id).then((data) => ({ data })),
      loadBusinessLines(supabase, business.id),
    ]);

  const allTasks = (tasks ?? []) as unknown as TaskWithCustomer[];
  const openTasks = allTasks.filter((t) => t.status !== "done");
  const doneTasks = allTasks.filter((t) => t.status === "done").slice(0, 15);
  const cur = business.currency;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="page-title">Tasks</h1>
      <p className="page-sub">
        Your daily action list — small steps, every day.
      </p>

      <div className="mt-4">
        <BusinessLineFilter basePath="/tasks" lines={lines} current={line} />
      </div>

      <div className="mt-6">
        <TaskComposer
          defaultCustomerId={isId(params.customer)}
          customers={customers ?? []}
          services={services ?? []}
          currency={business.currency}
          lines={lines}
          defaultLine={line && line !== NO_LINE ? line : undefined}
        />
      </div>

      <div className="mt-6">
        <h2 className="section-title">
          Open ({openTasks.length})
        </h2>
        {openTasks.length === 0 ? (
          <p className="mt-3 card-empty p-8 text-center text-sm text-slate-400">
            Nothing open. Add a task above — even &quot;follow up with one
            customer&quot; counts.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 overflow-hidden card">
            {openTasks.map((t) => (
              <TaskRow key={t.id} task={t} currency={cur} />
            ))}
          </ul>
        )}
      </div>

      {doneTasks.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-slate-400">
            Recently completed
          </h2>
          <ul className="mt-3 divide-y divide-slate-100 overflow-hidden card">
            {doneTasks.map((t) => (
              <TaskRow key={t.id} task={t} currency={cur} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
