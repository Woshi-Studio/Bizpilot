import Link from "next/link";
import { LEAD_STATUSES } from "@/lib/types";
import { NO_LINE, lineLabel } from "@/lib/business-lines";

export type ScoreRow = { business_line: string | null; metric: string; n: number };
export type DueItem = {
  id: string;
  name: string;
  date: string;
  href: string;
  line: string | null;
  kind: "lead" | "customer";
};

// Short words so five boxes fit on one row, even on a phone.
const SHORT_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Talking",
  meeting: "Meeting",
  declined: "Lost",
  converted: "Won",
};

const SCORE_STATUSES = ["new", "contacted", "meeting", "declined", "converted"] as const;

// One card per business line: leads by status, emails sent, replies, and
// follow-ups due today or overdue.
export default function Scoreboard({
  rows,
  due,
  lines,
  today,
  missing,
}: {
  rows: ScoreRow[];
  due: DueItem[];
  // lines to show (already filtered by the ?line= choice)
  lines: (string | null)[];
  today: string;
  missing?: boolean;
}) {
  if (missing) {
    return (
      <p className="alert-warn">
        The scoreboard needs migration 0014 — run it in Supabase.
      </p>
    );
  }

  const key = (l: string | null) => l ?? NO_LINE;
  const get = (line: string | null, metric: string) =>
    rows
      .filter((r) => key(r.business_line) === key(line) && r.metric === metric)
      .reduce((sum, r) => sum + Number(r.n), 0);

  const cards = lines
    .map((line) => {
      const leadCounts = SCORE_STATUSES.map((s) => ({
        status: s,
        n: get(line, `lead_${s}`),
      }));
      const sent = get(line, "email_sent");
      const replies = get(line, "email_reply");
      const lineDue = due.filter((d) => key(d.line) === key(line));
      const total = leadCounts.reduce((s, c) => s + c.n, 0) + sent + replies + lineDue.length;
      return { line, leadCounts, sent, replies, lineDue, total };
    })
    .filter((c) => c.total > 0);

  if (cards.length === 0) {
    return (
      <p className="card-empty p-6 text-center text-sm text-slate-400">
        Nothing to score yet. Tag leads and customers with a business to see
        each one here.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => {
        const lineParam = c.line ?? NO_LINE;
        return (
          <div
            key={key(c.line)}
            className="card p-5"
          >
            <div className="flex items-center justify-between">
              <h3 className="section-title">
                {lineLabel(c.line)}
              </h3>
              <Link
                href={`/leads?line=${encodeURIComponent(lineParam)}`}
                className="text-xs link"
              >
                Leads &rarr;
              </Link>
            </div>

            <div className="mt-3 grid grid-cols-5 gap-1.5">
              {c.leadCounts.map(({ status, n }) => {
                const meta = LEAD_STATUSES.find((s) => s.value === status);
                return (
                  <div
                    key={status}
                    className="rounded-xl bg-surface-2 px-1 py-2.5 text-center"
                  >
                    <p className={`text-lg font-semibold leading-none ${n ? "text-ink" : "text-subtle"}`}>{n}</p>
                    <p className="mt-1 truncate text-[11px] font-medium text-muted" title={meta?.label ?? status}>
                      {SHORT_LABEL[status] ?? meta?.label ?? status}
                    </p>
                  </div>
                );
              })}
            </div>

            <p className="mt-3 text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{c.sent}</span>{" "}
              email{c.sent === 1 ? "" : "s"} sent ·{" "}
              <span className="font-semibold text-slate-800">{c.replies}</span>{" "}
              repl{c.replies === 1 ? "y" : "ies"}
            </p>

            <div className="mt-3">
              <p className="eyebrow">
                Follow-ups due ({c.lineDue.length})
              </p>
              {c.lineDue.length === 0 ? (
                <p className="mt-1 text-sm text-slate-400">None due.</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {c.lineDue.slice(0, 8).map((d) => (
                    <li key={`${d.kind}-${d.id}`} className="text-sm">
                      <Link
                        href={d.href}
                        className="-mx-2 flex justify-between gap-2 rounded-md px-2 py-1 hover:bg-slate-50"
                      >
                        <span className="truncate text-slate-700">
                          {d.kind === "lead" ? "📣" : "👋"} {d.name}
                        </span>
                        <span
                          className={`shrink-0 text-xs font-medium ${
                            d.date < today ? "text-red-600" : "text-amber-600"
                          }`}
                        >
                          {d.date < today ? `since ${d.date}` : "today"}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {c.lineDue.length > 8 && (
                    <li className="text-xs text-slate-400">
                      + {c.lineDue.length - 8} more —{" "}
                      <Link
                        href={`/leads?line=${encodeURIComponent(lineParam)}`}
                        className="text-indigo-600 hover:underline"
                      >
                        see leads
                      </Link>
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
