"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";

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
