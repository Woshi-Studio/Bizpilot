"use server";

import { revalidatePath } from "next/cache";
import {
  requireUserAndBusiness,
  isMissingColumnError,
  optionalText,
} from "@/lib/data";
import { LEAD_CHANNELS, LEAD_STATUSES } from "@/lib/types";
import { normalizeLine } from "@/lib/business-lines";
import { logActivity } from "@/lib/activities";

export type OutreachFormState = {
  error?: string;
  success?: string;
};

export async function logOutreach(
  _prevState: OutreachFormState,
  formData: FormData
): Promise<OutreachFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const channel = String(formData.get("channel") ?? "other").trim();
  const followUpDate = String(formData.get("follow_up_date") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const businessLine = normalizeLine(formData.get("business_line"));

  if (!name) {
    return { error: "Prospect name is required." };
  }

  const { supabase, business } = await requireUserAndBusiness();
  const safeChannel = LEAD_CHANNELS.some((c) => c.value === channel)
    ? channel
    : "other";

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      business_id: business.id,
      name,
      email: email || null,
      channel: safeChannel,
      follow_up_date: followUpDate || null,
      message: message || null,
      status: "contacted",
      business_line: businessLine,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  const channelLabel =
    LEAD_CHANNELS.find((c) => c.value === safeChannel)?.label ?? safeChannel;
  await logActivity(supabase, {
    business_id: business.id,
    lead_id: lead.id,
    business_line: businessLine,
    kind: safeChannel === "email" ? "email_sent" : "note",
    subject:
      safeChannel === "email" ? `Outreach to ${name}` : `Outreach via ${channelLabel}`,
    body: message || null,
  });

  revalidatePath("/leads");
  revalidatePath("/dashboard");
  return { success: "Outreach logged." };
}

export async function setLeadStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !LEAD_STATUSES.some((s) => s.value === status)) return;

  const { supabase, business } = await requireUserAndBusiness();

  await supabase
    .from("leads")
    .update({ status })
    .eq("id", id)
    .eq("business_id", business.id);

  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  revalidatePath("/dashboard");
}

export async function updateLead(
  _prevState: OutreachFormState,
  formData: FormData
): Promise<OutreachFormState> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const channel = String(formData.get("channel") ?? "other").trim();
  const status = String(formData.get("status") ?? "new").trim();
  const followUpDate = String(formData.get("follow_up_date") ?? "").trim();

  if (!id) return { error: "Missing lead id." };
  if (!name) return { error: "Name is required." };
  if (name.length > 200) return { error: "Name is too long." };
  if (email.length > 320) return { error: "Email is too long." };
  if (phone.length > 50) return { error: "Phone is too long." };
  if (message.length > 2000) return { error: "Notes are too long (max 2000)." };

  const { supabase, business } = await requireUserAndBusiness();

  const base = {
    name,
    email: email || null,
    phone: phone || null,
    message: message || null,
    channel: LEAD_CHANNELS.some((c) => c.value === channel) ? channel : "other",
    status: LEAD_STATUSES.some((s) => s.value === status) ? status : "new",
    follow_up_date: followUpDate || null,
    business_line: normalizeLine(formData.get("business_line")),
  };
  // 0015 columns; retried without them if the migration isn't run yet.
  const extras = {
    company: optionalText(formData, "company", 200),
    address: optionalText(formData, "address", 300),
    website: optionalText(formData, "website", 300),
  };
  const update = (v: object) =>
    supabase.from("leads").update(v).eq("id", id).eq("business_id", business.id);
  let { error } = await update({ ...base, ...extras });
  if (isMissingColumnError(error)) ({ error } = await update(base));

  if (error) return { error: error.message };

  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return { success: "Lead saved." };
}

export async function convertLead(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, business } = await requireUserAndBusiness();

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();

  if (!lead || lead.status === "converted") return;

  const followUp = new Date();
  followUp.setDate(followUp.getDate() + 2);

  const { data: customer, error } = await supabase
    .from("customers")
    .insert({
      business_id: business.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      status: "lead",
      next_follow_up: followUp.toISOString().slice(0, 10),
      business_line: lead.business_line ?? null,
    })
    .select("id")
    .single();

  if (error || !customer) return;

  if (lead.message) {
    await supabase.from("customer_notes").insert({
      customer_id: customer.id,
      body: `From the public page: "${lead.message}"`,
    });
  }

  await supabase
    .from("leads")
    .update({ status: "converted" })
    .eq("id", id)
    .eq("business_id", business.id);

  // Past emails/calls logged against the lead also show on the new
  // customer's timeline.
  await supabase
    .from("activities")
    .update({ customer_id: customer.id })
    .eq("business_id", business.id)
    .eq("lead_id", id)
    .is("customer_id", null);

  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  revalidatePath("/customers");
  revalidatePath("/dashboard");
}

export async function deleteLead(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, business } = await requireUserAndBusiness();

  await supabase
    .from("leads")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id);

  revalidatePath("/leads");
  revalidatePath("/dashboard");
}
