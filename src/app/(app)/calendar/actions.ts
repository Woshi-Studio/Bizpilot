"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness, isMissingColumnError } from "@/lib/data";
import { MAX_ACTIVITY_BODY } from "@/lib/activities";
import { normalizeLine } from "@/lib/business-lines";

export type CalendarState = { error?: string; success?: string; savedAt?: number };

export type EntryType = "meeting" | "call" | "reminder" | "block" | "task";
const TYPES: EntryType[] = ["meeting", "call", "reminder", "block", "task"];

// Browser date + time (+ its getTimezoneOffset) -> UTC timestamp.
function toIso(date: string, time: string, tzOffsetRaw: unknown): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = /^\d{2}:\d{2}$/.test(time) ? time : "09:00";
  const base = Date.parse(`${date}T${t}:00Z`);
  if (Number.isNaN(base)) return null;
  const offset = Number(tzOffsetRaw);
  const safe = Number.isFinite(offset) && Math.abs(offset) <= 14 * 60 ? offset : 0;
  return new Date(base + safe * 60_000).toISOString();
}

function revalidateAll(customerId?: string | null, leadId?: string | null) {
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  revalidatePath("/tasks");
  if (customerId) revalidatePath(`/customers/${customerId}`);
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

// New or edited calendar entry: Meeting, Call, Reminder, Personal/blocked
// time (activities) or Task due (tasks). Customer / lead optional.
export async function saveCalendarEntry(_prev: CalendarState, formData: FormData): Promise<CalendarState> {
  const id = String(formData.get("id") ?? "").trim();
  const type = String(formData.get("type") ?? "meeting") as EntryType;
  const title = String(formData.get("title") ?? "").trim().slice(0, 300);
  const date = String(formData.get("date") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim();
  const endTime = String(formData.get("end_time") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const contact = String(formData.get("contact") ?? "");
  const [contactKind, contactId] = contact.split(":");
  const tz = formData.get("tz_offset");

  if (!TYPES.includes(type)) return { error: "Pick what kind of entry this is." };
  if (!title) return { error: "Give it a title." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date." };
  if (notes.length > MAX_ACTIVITY_BODY) return { error: "Notes are too long." };

  const { supabase, business } = await requireUserAndBusiness();

  let customerId: string | null = null;
  let leadId: string | null = null;
  let line: string | null = null;
  if (contactId && /^[0-9a-f-]{36}$/i.test(contactId)) {
    const table = contactKind === "lead" ? "leads" : "customers";
    const { data } = await supabase
      .from(table)
      .select("id, business_line")
      .eq("id", contactId)
      .eq("business_id", business.id)
      .maybeSingle();
    if (!data) return { error: "That contact wasn't found." };
    if (table === "leads") leadId = data.id as string;
    else customerId = data.id as string;
    line = (data as { business_line?: string | null }).business_line ?? null;
  }
  line = normalizeLine(formData.get("business_line")) ?? line;

  if (type === "task") {
    if (id) return { error: "Edit tasks on the Tasks page." };
    const { error } = await supabase.from("tasks").insert({
      business_id: business.id,
      title,
      due_date: date,
      customer_id: customerId,
      description: notes || null,
      business_line: line,
    });
    if (error) return { error: error.message };
    revalidateAll(customerId, leadId);
    return { success: "Task added.", savedAt: Date.now() };
  }

  const occurredAt = toIso(date, time, tz);
  if (!occurredAt) return { error: "That date doesn't look right." };
  let endsAt: string | null = null;
  if (/^\d{2}:\d{2}$/.test(endTime)) {
    endsAt = toIso(date, endTime, tz);
    if (endsAt && endsAt <= occurredAt) return { error: "The end time must be after the start." };
  }

  const row = {
    kind: type,
    subject: title,
    body: notes || null,
    occurred_at: occurredAt,
    customer_id: customerId,
    lead_id: leadId,
    business_line: line,
  };

  if (id) {
    const update = (r: object) =>
      supabase.from("activities").update(r).eq("id", id).eq("business_id", business.id);
    let { error } = await update({ ...row, ends_at: endsAt });
    if (isMissingColumnError(error)) ({ error } = await update(row));
    if (error) {
      return { error: /kind/.test(error.message) ? "Reminders and blocked time need migration 0017." : error.message };
    }
    revalidateAll(customerId, leadId);
    return { success: "Saved.", savedAt: Date.now() };
  }

  const insert = (r: object) => supabase.from("activities").insert({ ...r, business_id: business.id, source: "manual" });
  let { error } = await insert({ ...row, ends_at: endsAt });
  if (isMissingColumnError(error)) ({ error } = await insert(row));
  if (error) {
    return { error: /kind/.test(error.message) ? "Reminders and blocked time need migration 0017." : error.message };
  }
  revalidateAll(customerId, leadId);
  return { success: "Added to your calendar.", savedAt: Date.now() };
}

// Mark done: a task becomes Done; a meeting / call / reminder gets done_at.
export async function markEntryDone(formData: FormData) {
  const source = String(formData.get("source") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const { supabase, business } = await requireUserAndBusiness();
  if (source === "task") {
    await supabase
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("business_id", business.id);
  } else if (source === "activity") {
    await supabase
      .from("activities")
      .update({ done_at: new Date().toISOString() })
      .eq("id", id)
      .eq("business_id", business.id);
  }
  revalidateAll();
}
