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
import { isOwnerBusiness } from "@/lib/ai-quota";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkLineLimit, checkPlanLimit, planLimitFromError } from "@/lib/plan-limits";
import type { Business } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type OutreachFormState = {
  error?: string;
  success?: string;
  upgrade?: boolean;
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

  const limited =
    (await checkPlanLimit(supabase, business, "contacts")) ??
    (await checkLineLimit(supabase, business, businessLine));
  if (limited) return limited;

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
    return planLimitFromError(error, business) ?? { error: error.message };
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

  // On a plan with a contact limit, a converted lead stops counting, so
  // "Converted" means "Add to customers" (the database insists on it).
  if (status === "converted" && !isOwnerBusiness(business.id)) {
    await convertLeadCore(supabase, business, id);
  } else {
    await supabase
      .from("leads")
      .update({ status })
      .eq("id", id)
      .eq("business_id", business.id);
  }

  revalidatePath("/customers");
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

  const { data: before } = await supabase
    .from("leads")
    .select("status, business_line")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!before) return { error: "Lead not found." };

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
  if (base.business_line && base.business_line !== before.business_line) {
    const limited = await checkLineLimit(supabase, business, base.business_line);
    if (limited) return limited;
  }
  if (
    base.status === "converted" &&
    before.status !== "converted" &&
    !isOwnerBusiness(business.id)
  ) {
    const converted = await convertLeadCore(supabase, business, id);
    if (converted.error) return converted;
  }

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

  if (error) return planLimitFromError(error, business) ?? { error: error.message };

  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return { success: "Lead saved." };
}

// Turns a lead into a customer: adds the customer, marks the lead
// converted, moves its timeline over. Net zero for the contact limit
// (the lead stops counting as the customer starts), so the customer is
// written with the service role, which the plan triggers let through.
// The lead was checked to be this business's own just before.
async function convertLeadCore(
  supabase: SupabaseClient,
  business: Business,
  id: string
): Promise<OutreachFormState> {
  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();

  if (!lead) return { error: "Lead not found." };
  if (lead.status === "converted") return {};

  // Already a customer with this name (e.g. added by hand)? Just link up.
  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("business_id", business.id)
    .ilike("name", String(lead.name).replace(/[\\%_]/g, "\\$&"))
    .limit(1)
    .maybeSingle();

  let customerId = (existing as { id: string } | null)?.id ?? null;

  if (!customerId) {
    const followUp = new Date();
    followUp.setDate(followUp.getDate() + 2);
    const writer = createAdminClient() ?? supabase;
    const { data: customer, error } = await writer
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

    if (error || !customer) {
      return planLimitFromError(error, business) ?? { error: "Couldn't add the customer." };
    }
    customerId = customer.id as string;

    if (lead.message) {
      await supabase.from("customer_notes").insert({
        customer_id: customerId,
        body: `From the public page: "${lead.message}"`,
      });
    }
  }

  const { error: statusError } = await supabase
    .from("leads")
    .update({ status: "converted" })
    .eq("id", id)
    .eq("business_id", business.id);
  if (statusError) {
    return planLimitFromError(statusError, business) ?? { error: statusError.message };
  }

  // Past emails/calls logged against the lead also show on the new
  // customer's timeline.
  await supabase
    .from("activities")
    .update({ customer_id: customerId })
    .eq("business_id", business.id)
    .eq("lead_id", id)
    .is("customer_id", null);

  return {};
}

export async function convertLead(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, business } = await requireUserAndBusiness();
  await convertLeadCore(supabase, business, id);

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
