import type { SupabaseClient } from "@supabase/supabase-js";
import { isOwnerBusiness } from "@/lib/ai-quota";
import { BUSINESS_LINES, NO_LINE, mergeLines } from "@/lib/business-lines";

export type ActivityKind =
  | "email_sent"
  | "email_reply"
  | "call"
  | "meeting"
  | "note"
  | "file"
  | "invoice"
  | "task"
  | "reminder"
  | "block";

export type Activity = {
  id: string;
  business_id: string;
  customer_id: string | null;
  lead_id: string | null;
  business_line: string | null;
  kind: ActivityKind;
  subject: string | null;
  body: string | null;
  occurred_at: string;
  source: string;
  external_id: string | null;
  created_at: string;
};

export const ACTIVITY_KINDS: { value: ActivityKind; label: string; icon: string }[] = [
  { value: "email_sent", label: "Email sent", icon: "📤" },
  { value: "email_reply", label: "Reply", icon: "📥" },
  { value: "call", label: "Call", icon: "📞" },
  { value: "meeting", label: "Meeting", icon: "🤝" },
  { value: "note", label: "Note", icon: "📝" },
  { value: "file", label: "File", icon: "📎" },
  { value: "invoice", label: "Invoice", icon: "🧾" },
  { value: "task", label: "Task", icon: "✅" },
  { value: "reminder", label: "Reminder", icon: "⏰" },
  { value: "block", label: "Blocked time", icon: "⛔" },
];

// Kinds the owner can log by hand from the "Add activity" form.
export const MANUAL_ACTIVITY_KINDS: ActivityKind[] = [
  "note",
  "call",
  "meeting",
  "email_sent",
  "email_reply",
];

export const MAX_ACTIVITY_BODY = 5000;

// Writes one timeline row. Never throws: the timeline is a side record,
// so a failure here (e.g. 0014 not run yet) must not break the action
// that called it.
export async function logActivity(
  supabase: SupabaseClient,
  row: {
    business_id: string;
    kind: ActivityKind;
    subject?: string | null;
    body?: string | null;
    customer_id?: string | null;
    lead_id?: string | null;
    business_line?: string | null;
    occurred_at?: string;
    source?: "manual" | "mailer" | "gmail" | "phone_line" | "import";
  }
) {
  try {
    await supabase.from("activities").insert({
      business_id: row.business_id,
      kind: row.kind,
      subject: row.subject ? row.subject.slice(0, 300) : null,
      body: row.body ? row.body.slice(0, MAX_ACTIVITY_BODY) : null,
      customer_id: row.customer_id ?? null,
      lead_id: row.lead_id ?? null,
      business_line: row.business_line ?? null,
      occurred_at: row.occurred_at ?? new Date().toISOString(),
      source: row.source ?? "manual",
    });
  } catch {
    // ignore — see comment above
  }
}

// "12 emails sent · 2 replies · 1 call · last contact Sep 25"
export function summarizeActivities(activities: Activity[]) {
  const count = (k: ActivityKind) =>
    activities.filter((a) => a.kind === k).length;
  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  const parts = [
    plural(count("email_sent"), "email sent", "emails sent"),
    plural(count("email_reply"), "reply", "replies"),
    plural(count("call"), "call", "calls"),
  ];
  const meetings = count("meeting");
  if (meetings) parts.push(plural(meetings, "meeting", "meetings"));
  const now = Date.now();
  const lastContact = activities
    .filter(
      (a) =>
        ["email_sent", "email_reply", "call", "meeting"].includes(a.kind) &&
        new Date(a.occurred_at).getTime() <= now
    )
    .map((a) => a.occurred_at)
    .sort()
    .pop();
  return { parts, lastContact: lastContact ?? null };
}

// Applies a ?line= filter to a Supabase query on a table that has a
// business_line column.
type LineFilterable = {
  eq(column: string, value: string): unknown;
  is(column: string, value: null): unknown;
};

export function withLine<Q extends LineFilterable>(
  query: Q,
  line: string | undefined
): Q {
  if (!line) return query;
  if (line === NO_LINE) return query.is("business_line", null) as Q;
  return query.eq("business_line", line) as Q;
}

// All line names in use for this business (config + free text found in
// the data). Missing columns (0014 not run) just return the config list.
export async function loadBusinessLines(
  supabase: SupabaseClient,
  businessId: string
): Promise<string[]> {
  const tables = ["customers", "leads", "services", "tasks", "invoices"];
  const results = await Promise.all(
    tables.map((t) =>
      supabase
        .from(t)
        .select("business_line")
        .eq("business_id", businessId)
        .not("business_line", "is", null)
        .limit(1000)
    )
  );
  const found: string[] = [];
  for (const r of results) {
    if (r.error) continue;
    for (const row of (r.data ?? []) as { business_line: string | null }[]) {
      if (row.business_line) found.push(row.business_line);
    }
  }
  // The configured list (Woshi Studio, VWA, …) is the owner's own; other
  // businesses only see the lines they use themselves.
  if (!isOwnerBusiness(businessId)) {
    return [...new Set(found)].sort((a, b) => a.localeCompare(b));
  }
  return found.length ? mergeLines(found) : BUSINESS_LINES.map((l) => l.value);
}
