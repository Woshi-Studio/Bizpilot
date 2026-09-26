"use client";

import Link from "next/link";
import { TASK_STATUSES, formatMoney, type TaskStatus } from "@/lib/types";
import { setTaskStatus, deleteTask } from "./actions";
import { lineLabel } from "@/lib/business-lines";

export type TaskWithCustomer = {
  id: string;
  title: string;
  description: string | null;
  value: number | null;
  status: TaskStatus;
  due_date: string | null;
  completed_at: string | null;
  business_line?: string | null;
  customers: { id: string; name: string } | null;
};

const STATUS_CLASS: Record<TaskStatus, string> = {
  todo: "border-slate-300 text-slate-500",
  inprogress: "border-amber-300 text-amber-600",
  review: "border-indigo-300 text-indigo-600",
  done: "border-green-300 text-green-600",
};

function dueLabel(dateStr: string | null, done: boolean) {
  if (!dateStr) return null;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !done && dateStr < today;
  const isToday = dateStr === today;
  return (
    <span
      className={`text-xs ${
        overdue
          ? "font-medium text-red-600"
          : isToday && !done
            ? "font-medium text-amber-600"
            : "text-slate-400"
      }`}
    >
      {overdue ? "Overdue: " : ""}
      {isToday ? "Today" : dateStr}
    </span>
  );
}

export default function TaskRow({
  task,
  currency,
}: {
  task: TaskWithCustomer;
  currency: string;
}) {
  const done = task.status === "done";

  return (
    <li className="group flex items-center gap-3 px-5 py-3">
      <form action={setTaskStatus}>
        <input type="hidden" name="id" value={task.id} />
        <select
          name="status"
          defaultValue={task.status}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className={`rounded-md border bg-white px-1.5 py-1 text-xs font-medium ${STATUS_CLASS[task.status]}`}
        >
          {TASK_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </form>

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm ${
            done ? "text-slate-400 line-through" : "text-slate-800"
          }`}
        >
          {task.title}
        </p>
        {task.business_line && (
          <span className="mr-2 text-xs font-medium text-slate-400">
            {lineLabel(task.business_line)}
          </span>
        )}
        {task.customers && (
          <Link
            href={`/customers/${task.customers.id}`}
            className="text-xs text-indigo-500 hover:text-indigo-600"
          >
            {task.customers.name}
          </Link>
        )}
      </div>

      {task.value != null && (
        <span className="text-xs font-semibold text-indigo-600">
          {formatMoney(task.value, currency)}
        </span>
      )}

      {dueLabel(task.due_date, done)}

      <form action={deleteTask}>
        <input type="hidden" name="id" value={task.id} />
        <button
          type="submit"
          aria-label="Delete task"
          className="text-slate-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
        >
          &times;
        </button>
      </form>
    </li>
  );
}
