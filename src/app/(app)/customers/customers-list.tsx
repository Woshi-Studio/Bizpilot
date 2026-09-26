"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CUSTOMER_STATUSES, type Customer } from "@/lib/types";
import { lineLabel } from "@/lib/business-lines";
import Icon from "@/components/icons";

function statusBadge(status: string) {
  const s = CUSTOMER_STATUSES.find((s) => s.value === status);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        s?.badgeClass ?? "bg-slate-100 text-slate-500 border-slate-200"
      }`}
    >
      {s?.label ?? status}
    </span>
  );
}

function FollowUp({ date, today }: { date: string | null; today: string }) {
  if (!date) return <span className="text-sm text-subtle">—</span>;
  const overdue = date < today;
  const isToday = date === today;
  return (
    <span
      className={`text-sm ${
        overdue ? "font-medium text-red-600" : isToday ? "font-medium text-amber-600" : "text-ink-2"
      }`}
    >
      {overdue ? "Overdue · " : isToday ? "Today · " : ""}
      {date}
    </span>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function QuickActions({ c }: { c: Customer }) {
  const btn =
    "flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-accent-text";
  return (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      {c.email && (
        <a href={`mailto:${c.email}`} className={btn} title={`Email ${c.name}`} aria-label={`Email ${c.name}`}>
          <Icon name="mail" className="h-4 w-4" />
        </a>
      )}
      {c.phone && (
        <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className={btn} title={`Call ${c.name}`} aria-label={`Call ${c.name}`}>
          <Icon name="phone" className="h-4 w-4" />
        </a>
      )}
      <Link href={`/messages?contact=customer:${c.id}`} className={btn} title="Write a message with AI" aria-label={`Write a message to ${c.name}`}>
        <Icon name="sparkle" className="h-4 w-4" />
      </Link>
      <Link href={`/invoices/new?customer=${c.id}`} className={btn} title="New invoice" aria-label={`New invoice for ${c.name}`}>
        <Icon name="receipt" className="h-4 w-4" />
      </Link>
    </div>
  );
}

export default function CustomersList({
  customers,
  today,
}: {
  customers: Customer[];
  today: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = customers.filter((c) => {
    const q = query.toLowerCase();
    const matchesQuery =
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.company ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  const counts = Object.fromEntries(
    CUSTOMER_STATUSES.map((s) => [s.value, customers.filter((c) => c.status === s.value).length])
  );

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company, email or phone"
            aria-label="Search customers"
            className="input pl-10"
          />
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]">
          {[{ value: "all", label: "All" }, ...CUSTOMER_STATUSES].map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setStatusFilter(s.value)}
              className={statusFilter === s.value ? "chip chip-active" : "chip"}
            >
              {s.label}
              <span className="text-xs opacity-60">
                {s.value === "all" ? customers.length : counts[s.value] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card-empty mt-6 px-6 py-14 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-text">
            <Icon name="people" className="h-6 w-6" />
          </span>
          <p className="mt-4 text-base font-semibold text-ink">
            {customers.length === 0 ? "No customers yet" : "No one matches that search"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            {customers.length === 0
              ? "Add your first customer and Jephelen keeps track of follow-ups, invoices and every email for you."
              : "Try a shorter word, or clear the status filter."}
          </p>
          {customers.length === 0 && (
            <Link href="/customers/new" className="btn-primary mt-5">
              <Icon name="plus" className="h-4 w-4" />
              Add customer
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="card mt-6 hidden overflow-hidden md:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line/70 bg-surface-2">
                  <th className="eyebrow px-6 py-3 font-semibold">Name</th>
                  <th className="eyebrow px-4 py-3 font-semibold">Contact</th>
                  <th className="eyebrow px-4 py-3 font-semibold">Status</th>
                  <th className="eyebrow px-4 py-3 font-semibold">Follow-up</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/customers/${c.id}`)}
                    className="group cursor-pointer transition-colors hover:bg-surface-2"
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-xs font-semibold text-accent-text">
                          {initials(c.name)}
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`/customers/${c.id}`}
                            className="block truncate text-sm font-semibold text-ink group-hover:text-accent-text"
                          >
                            {c.name}
                          </Link>
                          <p className="truncate text-xs text-muted">
                            {c.company ?? "—"}
                            {c.business_line && <> · {lineLabel(c.business_line)}</>}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[16rem] px-4 py-3.5">
                      <p className="truncate text-sm text-ink-2">{c.email ?? "—"}</p>
                      <p className="truncate text-xs text-muted">{c.phone ?? ""}</p>
                    </td>
                    <td className="px-4 py-3.5">{statusBadge(c.status)}</td>
                    <td className="px-4 py-3.5">
                      <FollowUp date={c.next_follow_up} today={today} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end opacity-70 transition-opacity group-hover:opacity-100">
                        <QuickActions c={c} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <ul className="mt-5 space-y-3 md:hidden">
            {filtered.map((c) => (
              <li key={c.id} className="card p-4">
                <Link href={`/customers/${c.id}`} className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-sm font-semibold text-accent-text">
                    {initials(c.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-semibold text-ink">{c.name}</p>
                      {statusBadge(c.status)}
                    </div>
                    <p className="truncate text-sm text-muted">
                      {c.company ?? c.email ?? "No company"}
                    </p>
                  </div>
                </Link>
                <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5">
                  <FollowUp date={c.next_follow_up} today={today} />
                  <QuickActions c={c} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
