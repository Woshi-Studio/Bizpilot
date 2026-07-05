"use client";

import Link from "next/link";
import { useState } from "react";
import { CUSTOMER_STATUSES, type Customer } from "@/lib/types";

function statusBadge(status: string) {
  const s = CUSTOMER_STATUSES.find((s) => s.value === status);
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        s?.badgeClass ?? "bg-slate-100 text-slate-500 border-slate-200"
      }`}
    >
      {s?.label ?? status}
    </span>
  );
}

function followUpLabel(dateStr: string | null) {
  if (!dateStr) return null;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = dateStr < today;
  const isToday = dateStr === today;
  return (
    <span
      className={`text-xs ${
        overdue
          ? "font-medium text-red-600"
          : isToday
            ? "font-medium text-amber-600"
            : "text-slate-400"
      }`}
    >
      {overdue ? "Overdue: " : isToday ? "Today: " : "Follow up: "}
      {dateStr}
    </span>
  );
}

export default function CustomersList({
  customers,
}: {
  customers: Customer[];
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = customers.filter((c) => {
    const q = query.toLowerCase();
    const matchesQuery =
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.company ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customers..."
          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:max-w-xs"
        />
        <div className="flex gap-1.5">
          {[{ value: "all", label: "All" }, ...CUSTOMER_STATUSES].map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setStatusFilter(s.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === s.value
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-slate-600 border border-slate-300 hover:border-indigo-300"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-600">
            {customers.length === 0
              ? "No customers yet."
              : "No customers match your search."}
          </p>
          {customers.length === 0 && (
            <p className="mt-1 text-sm text-slate-400">
              Add your first customer and BizPilot will keep track of
              follow-ups for you.
            </p>
          )}
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {filtered.map((c) => (
            <li key={c.id}>
              <Link
                href={`/customers/${c.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {c.name}
                    {c.company && (
                      <span className="ml-2 font-normal text-slate-400">
                        {c.company}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {[c.email, c.phone].filter(Boolean).join(" · ") ||
                      "No contact info"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {statusBadge(c.status)}
                  {followUpLabel(c.next_follow_up)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
