"use client";

import Link from "next/link";
import { toggleTask, deleteTask } from "./actions";

export type TaskWithCustomer = {
  id: string;
  title: string;
  due_date: string | null;
  completed_at: string | null;
  customers: { id: string; name: string } | null;
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

export default function TaskRow({ task }: { task: TaskWithCustomer }) {
  const done = !!task.completed_at;

  return (
    <li className="group flex items-center gap-3 px-5 py-3">
      <form action={toggleTask}>
        <input type="hidden" name="id" value={task.id} />
        <input type="hidden" name="completed" value={String(!done)} />
        <button
          type="submit"
          aria-label={done ? "Mark as not done" : "Mark as done"}
          className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
            done
              ? "border-indigo-600 bg-indigo-600 text-white"
              : "border-slate-300 hover:border-indigo-400"
          }`}
        >
          {done && (
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
      </form>

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm ${
            done ? "text-slate-400 line-through" : "text-slate-800"
          }`}
        >
          {task.title}
        </p>
        {task.customers && (
          <Link
            href={`/customers/${task.customers.id}`}
            className="text-xs text-indigo-500 hover:text-indigo-600"
          >
            {task.customers.name}
          </Link>
        )}
      </div>

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
