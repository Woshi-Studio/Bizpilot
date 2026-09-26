import type { SupabaseClient } from "@supabase/supabase-js";
import { logActivity } from "@/lib/activities";
import { normalizeLine } from "@/lib/business-lines";
import type { AgentScope } from "@/lib/agent/keys";
import { checkLineLimit, checkPlanLimit } from "@/lib/plan-limits";
import { isOwnerBusiness } from "@/lib/ai-quota";
import { PLAN_LIMITS, normalizePlanValue, type LimitKind } from "@/lib/plans";
import {
  InputError,
  onlyFields,
  str,
  email,
  uuid,
  date,
  timestamp,
  oneOf,
  money,
  utcOffset,
  type Input,
} from "@/lib/agent/validate";

// Thrown when an id is missing or belongs to another business. The route
// answers 404 either way, so the caller can't tell which.
export class NotFoundError extends Error {}

// Thrown when the business's plan limit stops a create. The route answers
// 402 with the friendly message.
export class PlanLimitError extends Error {}

type Ctx = { db: SupabaseClient; businessId: string; plan: string | null };

// The agent API uses the service role, which the database plan triggers
// let through, so the same limits are checked here.
async function planCheck(ctx: Ctx, kind: LimitKind, line?: string | null) {
  const biz = { id: ctx.businessId, plan: ctx.plan };
  const block =
    (kind === "lines" ? null : await checkPlanLimit(ctx.db, biz, kind)) ??
    (await checkLineLimit(ctx.db, biz, line ?? null));
  if (block) throw new PlanLimitError(block.error);
}
type Handler = (ctx: Ctx, input: Input) => Promise<unknown>;

const LEAD_STATUSES = ["new", "contacted", "meeting", "converted", "declined"] as const;
const LEAD_CHANNELS = ["email", "upwork", "linkedin", "freelancer", "referral", "inbound", "other"] as const;
const LOG_KINDS = ["note", "call", "email_sent", "email_reply"] as const;

function fail(message: string): never {
  throw new Error(message);
}

// The contact's own row, only if it is in this business. Returns its line
// so new records default to the same business line.
async function customerLine(ctx: Ctx, id: string): Promise<string | null> {
  const { data, error } = await ctx.db
    .from("customers")
    .select("id, business_line")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle();
  if (error) fail("lookup failed");
  if (!data) throw new NotFoundError("customer not found");
  return (data as { business_line: string | null }).business_line ?? null;
}

async function leadLine(ctx: Ctx, id: string): Promise<string | null> {
  const { data, error } = await ctx.db
    .from("leads")
    .select("id, business_line")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle();
  if (error) fail("lookup failed");
  if (!data) throw new NotFoundError("lead not found");
  return (data as { business_line: string | null }).business_line ?? null;
}

async function contactLinks(ctx: Ctx, input: Input) {
  const customerId = uuid(input, "customer_id");
  const leadId = uuid(input, "lead_id");
  let line: string | null = null;
  if (customerId) line = await customerLine(ctx, customerId);
  if (leadId) line = line ?? (await leadLine(ctx, leadId));
  return { customerId, leadId, line };
}

const addCustomer: Handler = async (ctx, input) => {
  onlyFields(input, ["name", "email", "phone", "company", "business_line", "note"]);
  const name = str(input, "name", { required: true, max: 200 })!;
  const row = {
    business_id: ctx.businessId,
    name,
    email: email(input, "email"),
    phone: str(input, "phone", { max: 50 }),
    company: str(input, "company", { max: 200 }),
    business_line: normalizeLine(str(input, "business_line", { max: 60 })),
  };
  const note = str(input, "note", { max: 5000 });
  await planCheck(ctx, "contacts", row.business_line);

  const { data, error } = await ctx.db
    .from("customers")
    .insert(row)
    .select("id, name, email, business_line")
    .single();
  if (error || !data) fail("could not save the customer");

  if (note) {
    await ctx.db.from("customer_notes").insert({ customer_id: data.id, body: note });
    await logActivity(ctx.db, {
      business_id: ctx.businessId,
      customer_id: data.id,
      business_line: row.business_line,
      kind: "note",
      body: note,
    });
  }
  return { customer: data };
};

const addLead: Handler = async (ctx, input) => {
  onlyFields(input, ["name", "email", "phone", "message", "business_line", "channel", "follow_up_date"]);
  const row = {
    business_id: ctx.businessId,
    name: str(input, "name", { required: true, max: 200 })!,
    email: email(input, "email"),
    phone: str(input, "phone", { max: 50 }),
    message: str(input, "message", { max: 2000 }),
    business_line: normalizeLine(str(input, "business_line", { max: 60 })),
    channel: oneOf(input, "channel", LEAD_CHANNELS) ?? "other",
    follow_up_date: date(input, "follow_up_date"),
    status: "new",
  };
  await planCheck(ctx, "contacts", row.business_line);
  const { data, error } = await ctx.db
    .from("leads")
    .insert(row)
    .select("id, name, email, status, channel, business_line, follow_up_date")
    .single();
  if (error || !data) fail("could not save the lead");
  return { lead: data };
};

// Strips characters that have meaning in a PostgREST filter or a LIKE
// pattern ( , ( ) % _ * \ " ), so the search text is only ever text.
function cleanQuery(q: string) {
  return q
    .replace(/[^\p{L}\p{N}\s@.\-+']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Contact = {
  id: string;
  type: "customer" | "lead";
  name: string;
  email: string | null;
  business_line: string | null;
};

const findContact: Handler = async (ctx, input) => {
  onlyFields(input, ["q"]);
  const raw = str(input, "q", { required: true, max: 100 })!;
  const q = cleanQuery(raw);
  if (q.length < 2) throw new InputError("q needs at least 2 letters or numbers");
  const like = `%${q}%`;

  const [customers, leads] = await Promise.all([
    ctx.db
      .from("customers")
      .select("id, name, email, business_line")
      .eq("business_id", ctx.businessId)
      .or(`name.ilike.${like},email.ilike.${like},company.ilike.${like},phone.ilike.${like}`)
      .limit(10),
    ctx.db
      .from("leads")
      .select("id, name, email, business_line")
      .eq("business_id", ctx.businessId)
      .or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
      .limit(10),
  ]);
  if (customers.error || leads.error) fail("search failed");

  const lower = q.toLowerCase();
  const rank = (c: Contact) => {
    const n = c.name.toLowerCase();
    if (n === lower || (c.email ?? "").toLowerCase() === lower) return 0;
    if (n.startsWith(lower)) return 1;
    return 2;
  };
  const all: Contact[] = [
    ...(customers.data ?? []).map((c) => ({ ...c, type: "customer" as const })),
    ...(leads.data ?? []).map((l) => ({ ...l, type: "lead" as const })),
  ];
  all.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return {
    matches: all.slice(0, 10).map((c) => ({
      id: c.id,
      type: c.type,
      name: c.name,
      email: c.email,
      business_line: c.business_line,
    })),
  };
};

const addTask: Handler = async (ctx, input) => {
  onlyFields(input, ["title", "due_date", "customer_id", "business_line", "value"]);
  const title = str(input, "title", { required: true, max: 300 })!;
  const dueDate = date(input, "due_date");
  const customerId = uuid(input, "customer_id");
  const value = money(input, "value");
  let line = normalizeLine(str(input, "business_line", { max: 60 }));
  if (customerId) line = line ?? (await customerLine(ctx, customerId));
  await planCheck(ctx, "lines", line);

  const { data, error } = await ctx.db
    .from("tasks")
    .insert({
      business_id: ctx.businessId,
      title,
      due_date: dueDate,
      customer_id: customerId,
      value,
      business_line: line,
    })
    .select("id, title, due_date, customer_id, value, business_line, status")
    .single();
  if (error || !data) fail("could not save the task");

  await logActivity(ctx.db, {
    business_id: ctx.businessId,
    customer_id: customerId,
    business_line: line,
    kind: "task",
    subject: `Task created: ${title}`,
    body: dueDate ? `Due ${dueDate}` : null,
  });
  return { task: data };
};

const completeTask: Handler = async (ctx, input) => {
  onlyFields(input, ["task_id"]);
  const taskId = uuid(input, "task_id", true)!;
  const { data, error } = await ctx.db
    .from("tasks")
    .update({ completed_at: new Date().toISOString(), status: "done" })
    .eq("id", taskId)
    .eq("business_id", ctx.businessId)
    .select("id, title, customer_id, business_line, completed_at")
    .maybeSingle();
  if (error) fail("could not update the task");
  if (!data) throw new NotFoundError("task not found");

  await logActivity(ctx.db, {
    business_id: ctx.businessId,
    customer_id: data.customer_id,
    business_line: data.business_line,
    kind: "task",
    subject: `Task done: ${data.title}`,
  });
  return { task: data };
};

const bookMeeting: Handler = async (ctx, input) => {
  onlyFields(input, ["title", "starts_at", "customer_id", "lead_id", "notes", "business_line"]);
  const title = str(input, "title", { required: true, max: 300 })!;
  const startsAt = timestamp(input, "starts_at", true)!;
  const notes = str(input, "notes", { max: 5000 });
  const links = await contactLinks(ctx, input);
  const line = normalizeLine(str(input, "business_line", { max: 60 })) ?? links.line;

  const { data, error } = await ctx.db
    .from("activities")
    .insert({
      business_id: ctx.businessId,
      customer_id: links.customerId,
      lead_id: links.leadId,
      business_line: line,
      kind: "meeting",
      subject: title,
      body: notes,
      occurred_at: startsAt,
      source: "manual",
    })
    .select("id, subject, occurred_at, customer_id, lead_id, business_line")
    .single();
  if (error || !data) fail("could not save the meeting");
  return { meeting: data };
};

const logActivityAction: Handler = async (ctx, input) => {
  onlyFields(input, ["kind", "subject", "body", "customer_id", "lead_id", "occurred_at", "business_line"]);
  const kind = oneOf(input, "kind", LOG_KINDS, true)!;
  const subject = str(input, "subject", { required: true, max: 300 })!;
  const body = str(input, "body", { max: 5000 });
  const occurredAt = timestamp(input, "occurred_at") ?? new Date().toISOString();
  const links = await contactLinks(ctx, input);
  const line = normalizeLine(str(input, "business_line", { max: 60 })) ?? links.line;

  const { data, error } = await ctx.db
    .from("activities")
    .insert({
      business_id: ctx.businessId,
      customer_id: links.customerId,
      lead_id: links.leadId,
      business_line: line,
      kind,
      subject,
      body,
      occurred_at: occurredAt,
      source: "manual",
    })
    .select("id, kind, subject, occurred_at, customer_id, lead_id, business_line")
    .single();
  if (error || !data) fail("could not save the activity");
  return { activity: data };
};

function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// "Today" in the caller's zone: pass date (YYYY-MM-DD) and/or utc_offset
// (-04:00). Without them, today is the UTC date.
const today: Handler = async (ctx, input) => {
  onlyFields(input, ["date", "utc_offset"]);
  const offset = utcOffset(input, "utc_offset");
  const day =
    date(input, "date") ??
    new Date(Date.now() + offset * 60_000).toISOString().slice(0, 10);
  // Local midnight today -> local midnight the day after tomorrow, in UTC.
  const from = new Date(Date.parse(`${day}T00:00:00Z`) - offset * 60_000).toISOString();
  const to = new Date(Date.parse(`${addDays(day, 2)}T00:00:00Z`) - offset * 60_000).toISOString();

  const [custFollow, leadFollow, tasks, meetings] = await Promise.all([
    ctx.db
      .from("customers")
      .select("id, name, email, business_line, next_follow_up")
      .eq("business_id", ctx.businessId)
      .lte("next_follow_up", day)
      .order("next_follow_up")
      .limit(50),
    ctx.db
      .from("leads")
      .select("id, name, email, business_line, follow_up_date, status")
      .eq("business_id", ctx.businessId)
      .lte("follow_up_date", day)
      .not("status", "in", "(converted,declined)")
      .order("follow_up_date")
      .limit(50),
    ctx.db
      .from("tasks")
      .select("id, title, due_date, customer_id, business_line, value")
      .eq("business_id", ctx.businessId)
      .is("completed_at", null)
      .lte("due_date", day)
      .order("due_date")
      .limit(50),
    ctx.db
      .from("activities")
      .select("id, subject, occurred_at, customer_id, lead_id, business_line")
      .eq("business_id", ctx.businessId)
      .eq("kind", "meeting")
      .gte("occurred_at", from)
      .lt("occurred_at", to)
      .order("occurred_at")
      .limit(50),
  ]);
  if (custFollow.error || leadFollow.error || tasks.error || meetings.error) {
    fail("could not load today");
  }

  const followUps = [
    ...(custFollow.data ?? []).map((c) => ({
      id: c.id,
      type: "customer",
      name: c.name,
      email: c.email,
      business_line: c.business_line,
      due: c.next_follow_up as string,
      overdue: (c.next_follow_up as string) < day,
    })),
    ...(leadFollow.data ?? []).map((l) => ({
      id: l.id,
      type: "lead",
      name: l.name,
      email: l.email,
      business_line: l.business_line,
      due: l.follow_up_date as string,
      overdue: (l.follow_up_date as string) < day,
    })),
  ].sort((a, b) => a.due.localeCompare(b.due));

  return {
    date: day,
    follow_ups: followUps,
    tasks: (tasks.data ?? []).map((t) => ({ ...t, overdue: (t.due_date as string) < day })),
    meetings: meetings.data ?? [],
  };
};

const setLeadStatus: Handler = async (ctx, input) => {
  onlyFields(input, ["lead_id", "status"]);
  const leadId = uuid(input, "lead_id", true)!;
  const status = oneOf(input, "status", LEAD_STATUSES, true)!;

  // With a contact limit, a converted lead stops counting, so it must
  // really be a customer first (same rule as the database, 0017).
  if (
    status === "converted" &&
    !isOwnerBusiness(ctx.businessId) &&
    PLAN_LIMITS[normalizePlanValue(ctx.plan)].contacts !== null
  ) {
    const { data: lead } = await ctx.db
      .from("leads")
      .select("name")
      .eq("id", leadId)
      .eq("business_id", ctx.businessId)
      .maybeSingle();
    if (!lead) throw new NotFoundError("lead not found");
    const { count } = await ctx.db
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("business_id", ctx.businessId)
      .ilike("name", String(lead.name).replace(/[\\%_]/g, "\\$&"));
    if (!count) {
      throw new InputError("add this person with add_customer first, then mark the lead converted");
    }
  }

  const { data, error } = await ctx.db
    .from("leads")
    .update({ status })
    .eq("id", leadId)
    .eq("business_id", ctx.businessId)
    .select("id, name, status")
    .maybeSingle();
  if (error) fail("could not update the lead");
  if (!data) throw new NotFoundError("lead not found");
  return { lead: data };
};

// Bookings made on the public booking page (0018). Default: upcoming
// confirmed bookings for the next 30 days.
//   from / to: YYYY-MM-DD (UTC days) or ISO times with a zone
//   status:    confirmed | cancelled | attended | no_show | all
//   limit:     1-100 (default 50)
const BOOKING_STATUSES = ["confirmed", "cancelled", "attended", "no_show", "all"] as const;

const listBookings: Handler = async (ctx, input) => {
  onlyFields(input, ["from", "to", "status", "limit"]);
  const when = (field: string) => {
    const v = input[field];
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
      return `${date(input, field)}T00:00:00.000Z`;
    }
    return timestamp(input, field);
  };
  const now = Date.now();
  const from = when("from") ?? new Date(now).toISOString();
  const to = when("to") ?? new Date(Date.parse(from) + 30 * 86_400_000).toISOString();
  if (Date.parse(to) <= Date.parse(from)) throw new InputError("to must be after from");
  if (Date.parse(to) - Date.parse(from) > 366 * 86_400_000) throw new InputError("at most 366 days at a time");
  const status = oneOf(input, "status", BOOKING_STATUSES) ?? "confirmed";
  const rawLimit = input.limit;
  const limit = rawLimit === undefined || rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new InputError("limit must be 1 to 100");

  let q = ctx.db
    .from("bookings")
    .select(
      "id, type_name, starts_at, ends_at, status, name, email, phone, note, answers, customer_id, lead_id, location_kind, location_detail, email_status, created_at"
    )
    .eq("business_id", ctx.businessId)
    .gte("starts_at", from)
    .lt("starts_at", to)
    .order("starts_at")
    .limit(limit);
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) fail("could not load bookings (is migration 0018 run?)");
  return { from, to, status, bookings: data ?? [] };
};

export const AGENT_ACTIONS: Record<string, { scope: AgentScope; run: Handler }> = {
  add_customer: { scope: "customers:write", run: addCustomer },
  add_lead: { scope: "leads:write", run: addLead },
  find_contact: { scope: "contacts:read", run: findContact },
  add_task: { scope: "tasks:write", run: addTask },
  complete_task: { scope: "tasks:write", run: completeTask },
  book_meeting: { scope: "calendar:write", run: bookMeeting },
  log_activity: { scope: "activities:write", run: logActivityAction },
  today: { scope: "contacts:read", run: today },
  set_lead_status: { scope: "leads:write", run: setLeadStatus },
  list_bookings: { scope: "calendar:read", run: listBookings },
};
