"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness, belongsToBusiness } from "@/lib/data";
import {
  MANUAL_ACTIVITY_KINDS,
  MAX_ACTIVITY_BODY,
  type ActivityKind,
} from "@/lib/activities";
import { normalizeLine } from "@/lib/business-lines";

export type ActivityFormState = {
  error?: string;
  success?: string;
};

// Turns a date ("YYYY-MM-DD") + time ("HH:mm") typed in the browser into
// a UTC timestamp. `tzOffset` is the browser's getTimezoneOffset() (in
// minutes, positive west of UTC), sent from the form.
function toIso(date: string, time: string, tzOffsetRaw: unknown): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = /^\d{2}:\d{2}$/.test(time) ? time : "12:00";
  const base = Date.parse(`${date}T${t}:00Z`);
  if (Number.isNaN(base)) return null;
  const offset = Number(tzOffsetRaw);
  const safeOffset =
    Number.isFinite(offset) && Math.abs(offset) <= 14 * 60 ? offset : 0;
  return new Date(base + safeOffset * 60_000).toISOString();
}

// Customer/lead ids from a form must belong to this business. Returns the
// cleaned ids plus the line to default to (the contact's own line).
async function resolveLinks(
  supabase: Awaited<ReturnType<typeof requireUserAndBusiness>>["supabase"],
  businessId: string,
  customerId: string,
  leadId: string
): Promise<
  | { error: string }
  | { customerId: string | null; leadId: string | null; line: string | null }
> {
  let line: string | null = null;
  if (customerId) {
    const { data } = await supabase
      .from("customers")
      .select("id, business_line")
      .eq("id", customerId)
      .eq("business_id", businessId)
      .maybeSingle();
    if (!data) return { error: "That customer wasn't found." };
    line = (data as { business_line?: string | null }).business_line ?? null;
  }
  if (leadId) {
    if (!(await belongsToBusiness(supabase, "leads", leadId, businessId))) {
      return { error: "That lead wasn't found." };
    }
    if (!line) {
      const { data } = await supabase
        .from("leads")
        .select("business_line")
        .eq("id", leadId)
        .maybeSingle();
      line = (data as { business_line?: string | null } | null)?.business_line ?? null;
    }
  }
  return { customerId: customerId || null, leadId: leadId || null, line };
}

export async function addActivity(
  _prevState: ActivityFormState,
  formData: FormData
): Promise<ActivityFormState> {
  const kind = String(formData.get("kind") ?? "") as ActivityKind;
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 300);
  const body = String(formData.get("body") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim();
  const customerId = String(formData.get("customer_id") ?? "").trim();
  const leadId = String(formData.get("lead_id") ?? "").trim();

  if (!MANUAL_ACTIVITY_KINDS.includes(kind)) {
    return { error: "Pick what kind of activity this is." };
  }
  if (!subject && !body) {
    return { error: "Add a title or some details." };
  }
  if (body.length > MAX_ACTIVITY_BODY) {
    return { error: `Details are too long (max ${MAX_ACTIVITY_BODY} characters).` };
  }

  const occurredAt = date
    ? toIso(date, time, formData.get("tz_offset"))
    : new Date().toISOString();
  if (!occurredAt) {
    return { error: "That date doesn't look right." };
  }

  const { supabase, business } = await requireUserAndBusiness();
  const links = await resolveLinks(supabase, business.id, customerId, leadId);
  if ("error" in links) return { error: links.error };

  const { error } = await supabase.from("activities").insert({
    business_id: business.id,
    customer_id: links.customerId,
    lead_id: links.leadId,
    business_line: normalizeLine(formData.get("business_line")) ?? links.line,
    kind,
    subject: subject || null,
    body: body || null,
    occurred_at: occurredAt,
    source: "manual",
  });

  if (error) {
    return { error: error.message };
  }

  if (links.customerId) revalidatePath(`/customers/${links.customerId}`);
  if (links.leadId) revalidatePath(`/leads/${links.leadId}`);
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return { success: "Saved to the timeline." };
}

export async function addMeeting(
  _prevState: ActivityFormState,
  formData: FormData
): Promise<ActivityFormState> {
  const title = String(formData.get("subject") ?? "").trim().slice(0, 300);
  const body = String(formData.get("body") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim();
  const customerId = String(formData.get("customer_id") ?? "").trim();
  const leadId = String(formData.get("lead_id") ?? "").trim();

  if (!title) return { error: "Give the meeting a title." };
  if (!date) return { error: "Pick a date." };
  if (body.length > MAX_ACTIVITY_BODY) {
    return { error: `Details are too long (max ${MAX_ACTIVITY_BODY} characters).` };
  }
  const occurredAt = toIso(date, time, formData.get("tz_offset"));
  if (!occurredAt) return { error: "That date doesn't look right." };

  const { supabase, business } = await requireUserAndBusiness();
  const links = await resolveLinks(supabase, business.id, customerId, leadId);
  if ("error" in links) return { error: links.error };

  const { error } = await supabase.from("activities").insert({
    business_id: business.id,
    customer_id: links.customerId,
    lead_id: links.leadId,
    business_line: normalizeLine(formData.get("business_line")) ?? links.line,
    kind: "meeting",
    subject: title,
    body: body || null,
    occurred_at: occurredAt,
    source: "manual",
  });

  if (error) return { error: error.message };

  if (links.customerId) revalidatePath(`/customers/${links.customerId}`);
  if (links.leadId) revalidatePath(`/leads/${links.leadId}`);
  revalidatePath("/calendar");
  return { success: "Meeting added." };
}

export async function deleteActivity(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, business } = await requireUserAndBusiness();

  const { data } = await supabase
    .from("activities")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id)
    .select("customer_id, lead_id")
    .maybeSingle();

  if (data?.customer_id) revalidatePath(`/customers/${data.customer_id}`);
  if (data?.lead_id) revalidatePath(`/leads/${data.lead_id}`);
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
}
