import Link from "next/link";
import { requireUserAndBusiness } from "@/lib/data";
import BusinessLineFilter from "@/components/business-line-filter";
import { loadBusinessLines, withLine } from "@/lib/activities";
import { NO_LINE, lineFromParam } from "@/lib/business-lines";
import CalendarGrid, { type CalendarItem } from "./calendar-grid";
import MeetingForm from "./meeting-form";

export const metadata = { title: "Calendar" };

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
  searchParams: Promise<{ view?: string; date?: string; line?: string }>;
}) {
  const params = await searchParams;
  const view = params.view === "week" ? "week" : "month";
  const anchor = parseDay(params.date);
  const line = lineFromParam(params.line);
  const { supabase, business } = await requireUserAndBusiness();

  // Visible range: a Sunday-start week, or the 6 weeks that cover the month.
  let start: Date;
  let dayCount: number;
  let prev: Date;
  let next: Date;
  let title: string;
  if (view === "week") {
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
      inRange("activities", "id, subject, occurred_at, customer_id, lead_id, business_line")
        .eq("kind", "meeting")
        .gte("occurred_at", fromTs)
        .lt("occurred_at", toTs),
      loadBusinessLines(supabase, business.id),
      supabase
        .from("customers")
        .select("id, name")
        .eq("business_id", business.id)
        .order("name")
        .limit(1000),
      supabase
        .from("leads")
        .select("id, name")
        .eq("business_id", business.id)
        .not("status", "in", "(converted,declined)")
        .order("name")
        .limit(1000),
    ]);
  const rows = (r: { data: unknown }) => (r.data ?? []) as Row[];

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
    items.push({
      key: `meet-${m.id}`,
      kind: "meeting",
      title: m.subject ?? "Meeting",
      at: m.occurred_at,
      href: m.customer_id
        ? `/customers/${m.customer_id}`
        : m.lead_id
          ? `/leads/${m.lead_id}`
          : null,
      line: m.business_line,
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
      <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
      <p className="mt-1 text-sm text-slate-500">
        Tasks, follow-ups, invoice due dates and meetings — all in one place.
      </p>

      <div className="mt-4">
        <BusinessLineFilter
          basePath="/calendar"
          lines={lines}
          current={line}
          keep={keep}
        />
      </div>

      {missing && (
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
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
          {(["month", "week"] as const).map((v) => (
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
          items={items}
        />
      </div>

      <div className="mt-6">
        <MeetingForm
          customers={(customerList.data ?? []) as { id: string; name: string }[]}
          leads={(leadList.data ?? []) as { id: string; name: string }[]}
          lines={lines}
          defaultLine={line && line !== NO_LINE ? line : undefined}
        />
      </div>
    </div>
  );
}
