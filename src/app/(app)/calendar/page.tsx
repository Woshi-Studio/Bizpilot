import Link from "next/link";
import { requireUserAndBusiness } from "@/lib/data";
import BusinessLineFilter from "@/components/business-line-filter";
import { loadBusinessLines, withLine } from "@/lib/activities";
import { lineFromParam } from "@/lib/business-lines";
import CalendarGrid, { type CalendarContact, type CalendarItem } from "./calendar-grid";
import NewEntryButton from "./new-entry-button";
import { emailStatus } from "@/lib/email";

// Only a uuid can prefill the meeting form (from a contact page).
const isId = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);

export const metadata = { title: "Calendar" };

const KIND_TITLES: Record<string, string> = {
  meeting: "Meeting",
  call: "Call",
  reminder: "Reminder",
  block: "Busy",
};

// All date math here is on plain "YYYY-MM-DD" strings in UTC, so the
// server's time zone can't shift a day.
function parseDay(s: string | undefined) {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; line?: string; customer?: string; lead?: string }>;
}) {
  const params = await searchParams;
  const view = params.view === "week" ? "week" : params.view === "day" ? "day" : "month";
  const anchor = parseDay(params.date);
  const line = lineFromParam(params.line);
  const { supabase, business } = await requireUserAndBusiness();

  // Visible range: a Sunday-start week, or the 6 weeks that cover the month.
  let start: Date;
  let dayCount: number;
  let prev: Date;
  let next: Date;
  let title: string;
  if (view === "day") {
    start = anchor;
    dayCount = 1;
    prev = addDays(anchor, -1);
    next = addDays(anchor, 1);
    title = anchor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  } else if (view === "week") {
    start = addDays(anchor, -anchor.getUTCDay());
    dayCount = 7;
    prev = addDays(anchor, -7);
    next = addDays(anchor, 7);
    const end = addDays(start, 6);
    title = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
  } else {
    const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
    start = addDays(first, -first.getUTCDay());
    dayCount = 42;
    prev = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 1, 1));
    next = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1));
    title = first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  const days = Array.from({ length: dayCount }, (_, i) => ymd(addDays(start, i)));
  const from = days[0];
  const to = days[days.length - 1];
  // Meetings are timestamps: pad a day each side for time zones; the
  // browser places them on the right local day.
  const fromTs = `${ymd(addDays(start, -1))}T00:00:00Z`;
  const toTs = `${ymd(addDays(start, dayCount + 1))}T00:00:00Z`;

  type Row = Record<string, string | null>;
  // Column lists typed as plain strings keep the query types simple.
  const cols = (c: string) => c;
  const inRange = (table: string, columns: string) =>
    withLine(
      supabase.from(table).select(cols(columns)).eq("business_id", business.id),
      line
    );

  const [tasks, leads, customers, invoices, meetings, lines, customerList, leadList] =
    await Promise.all([
      inRange("tasks", "id, title, due_date, status, customer_id, business_line")
        .gte("due_date", from)
        .lte("due_date", to),
      inRange("leads", "id, name, follow_up_date, status, business_line")
        .gte("follow_up_date", from)
        .lte("follow_up_date", to)
        .not("status", "in", "(converted,declined)"),
      inRange("customers", "id, name, next_follow_up, business_line")
        .gte("next_follow_up", from)
        .lte("next_follow_up", to),
      inRange("invoices", "id, number, due_date, status, doc_type, business_line")
        .gte("due_date", from)
        .lte("due_date", to),
      inRange("activities", "*")
        .in("kind", ["meeting", "call", "reminder", "block"])
        .gte("occurred_at", fromTs)
        .lt("occurred_at", toTs),
      loadBusinessLines(supabase, business.id),
      supabase
        .from("customers")
        .select("id, name, email")
        .eq("business_id", business.id)
        .order("name")
        .limit(1000),
      supabase
        .from("leads")
        .select("id, name, email")
        .eq("business_id", business.id)
        .not("status", "in", "(converted,declined)")
        .order("name")
        .limit(1000),
    ]);
  const rows = (r: { data: unknown }) => (r.data ?? []) as Row[];

  const contacts: CalendarContact[] = [
    ...((customerList.data ?? []) as { id: string; name: string; email: string | null }[]).map(
      (c) => ({ kind: "customer" as const, ...c })
    ),
    ...((leadList.data ?? []) as { id: string; name: string; email: string | null }[]).map(
      (l) => ({ kind: "lead" as const, ...l })
    ),
  ];
  const contactFor = (customerId?: string | null, leadId?: string | null) =>
    contacts.find(
      (c) => (customerId && c.kind === "customer" && c.id === customerId) || (leadId && c.kind === "lead" && c.id === leadId)
    ) ?? null;

  const items: CalendarItem[] = [];
  for (const t of rows(tasks)) {
    items.push({
      key: `task-${t.id}`,
      kind: "task",
      title: t.title ?? "Task",
      date: t.due_date,
      href: t.customer_id ? `/customers/${t.customer_id}` : "/tasks",
      done: t.status === "done",
      line: t.business_line,
      source: "task",
      id: t.id ?? undefined,
      contact: contactFor(t.customer_id),
    });
  }
  for (const l of rows(leads)) {
    items.push({
      key: `lead-${l.id}`,
      kind: "lead",
      title: `Follow up: ${l.name ?? ""}`,
      date: l.follow_up_date,
      href: `/leads/${l.id}`,
      line: l.business_line,
    });
  }
  for (const c of rows(customers)) {
    items.push({
      key: `cust-${c.id}`,
      kind: "customer",
      title: `Follow up: ${c.name ?? ""}`,
      date: c.next_follow_up,
      href: `/customers/${c.id}`,
      line: c.business_line,
    });
  }
  for (const i of rows(invoices)) {
    items.push({
      key: `inv-${i.id}`,
      kind: "invoice",
      title: `${i.doc_type === "quote" ? "Quote" : "Invoice"} ${i.number ?? ""} due`,
      date: i.due_date,
      href: `/invoices/${i.id}`,
      done: i.status === "paid",
      line: i.business_line,
    });
  }
  for (const m of rows(meetings)) {
    const kind = (["meeting", "call", "reminder", "block"].includes(m.kind ?? "") ? m.kind : "meeting") as CalendarItem["kind"];
    items.push({
      key: `act-${m.id}`,
      kind,
      title: m.subject ?? KIND_TITLES[kind] ?? "Meeting",
      at: m.occurred_at,
      endsAt: m.ends_at ?? null,
      href: m.customer_id
        ? `/customers/${m.customer_id}`
        : m.lead_id
          ? `/leads/${m.lead_id}`
          : null,
      line: m.business_line,
      source: "activity",
      id: m.id ?? undefined,
      notes: m.body,
      done: !!m.done_at,
      contact: contactFor(m.customer_id, m.lead_id),
    });
  }

  const missing = !!(meetings.error || tasks.error);
  const keep = { view, date: params.date };
  const nav = (date: Date | null, v: string = view) => {
    const q = new URLSearchParams();
    q.set("view", v);
    if (date) q.set("date", ymd(date));
    if (params.line) q.set("line", params.line);
    return `/calendar?${q.toString()}`;
  };
  const pill =
    "rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-sub">
            Meetings, calls, reminders, tasks, follow-ups and invoice due dates. Click any day to add.
          </p>
        </div>
        <NewEntryButton />
      </div>

      <div className="mt-4">
        <BusinessLineFilter
          basePath="/calendar"
          lines={lines}
          current={line}
          keep={keep}
        />
      </div>

      {missing && (
        <p className="mt-4 alert-warn">
          Some calendar data couldn&apos;t load — make sure migration 0014 has
          been run in Supabase.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={nav(prev)} className={pill} aria-label="Previous">
            &larr;
          </Link>
          <Link href={nav(null)} className={pill}>
            Today
          </Link>
          <Link href={nav(next)} className={pill} aria-label="Next">
            &rarr;
          </Link>
          <h2 className="ml-2 text-lg font-semibold text-slate-800">{title}</h2>
        </div>
        <div className="flex gap-1.5">
          {(["month", "week", "day"] as const).map((v) => (
            <Link
              key={v}
              href={nav(anchor, v)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
                view === v
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-300 bg-white text-slate-600 hover:border-indigo-300"
              }`}
            >
              {v}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <CalendarGrid
          days={days}
          month={view === "month" ? ymd(anchor).slice(0, 7) : null}
          view={view}
          items={items}
          contacts={contacts}
          businessName={business.name}
          canSend={emailStatus(business).canSend}
          prefillContact={
            isId(params.customer) ? `customer:${params.customer}` : isId(params.lead) ? `lead:${params.lead}` : undefined
          }
        />
      </div>

      <p id="book" className="mt-3 text-xs text-muted">
        Tip: click a day (or an hour in Day view) to add a meeting, call, reminder, blocked time or task.
      </p>
    </div>
  );
}
