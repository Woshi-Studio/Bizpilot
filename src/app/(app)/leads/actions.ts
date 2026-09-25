"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";
import { LEAD_CHANNELS, LEAD_STATUSES } from "@/lib/types";

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

  if (!name) {
    return { error: "Prospect name is required." };
  }

  const { supabase, business } = await requireUserAndBusiness();

  const { error } = await supabase.from("leads").insert({
    business_id: business.id,
    name,
    channel: LEAD_CHANNELS.some((c) => c.value === channel) ? channel : "other",
    follow_up_date: followUpDate || null,
    message: message || null,
    status: "contacted",
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/leads");
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

  revalidatePath("/leads");
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
}
