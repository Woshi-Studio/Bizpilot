"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";
import { CUSTOMER_STATUSES } from "@/lib/types";

export type CustomerFormState = {
  error?: string;
  success?: string;
};

function readCustomerForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const status = String(formData.get("status") ?? "lead").trim();
  const nextFollowUp = String(formData.get("next_follow_up") ?? "").trim();

  return {
    name,
    email: email || null,
    phone: phone || null,
    company: company || null,
    status: CUSTOMER_STATUSES.some((s) => s.value === status) ? status : "lead",
    next_follow_up: nextFollowUp || null,
  };
}

export async function createCustomer(
  _prevState: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  const values = readCustomerForm(formData);
  if (!values.name) {
    return { error: "Customer name is required." };
  }

  const { supabase, business } = await requireUserAndBusiness();

  const { data, error } = await supabase
    .from("customers")
    .insert({ ...values, business_id: business.id })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/customers");
  redirect(`/customers/${data.id}`);
}

export async function updateCustomer(
  _prevState: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  const id = String(formData.get("id") ?? "");
  const values = readCustomerForm(formData);

  if (!id) {
    return { error: "Missing customer id." };
  }
  if (!values.name) {
    return { error: "Customer name is required." };
  }

  const { supabase, business } = await requireUserAndBusiness();

  const { error } = await supabase
    .from("customers")
    .update(values)
    .eq("id", id)
    .eq("business_id", business.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { success: "Customer saved." };
}

export async function deleteCustomer(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, business } = await requireUserAndBusiness();

  await supabase
    .from("customers")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id);

  revalidatePath("/customers");
  redirect("/customers");
}

export async function addNote(
  _prevState: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  const customerId = String(formData.get("customer_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!customerId || !body) {
    return { error: "Note text is required." };
  }

  const { supabase, business } = await requireUserAndBusiness();

  // Confirm the customer belongs to this business (RLS backs this up too)
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (!customer) {
    return { error: "Customer not found." };
  }

  const { error } = await supabase
    .from("customer_notes")
    .insert({ customer_id: customerId, body });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/customers/${customerId}`);
  return { success: "Note added." };
}

export async function deleteNote(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const customerId = String(formData.get("customer_id") ?? "");
  if (!id) return;

  const { supabase } = await requireUserAndBusiness();
  await supabase.from("customer_notes").delete().eq("id", id);

  if (customerId) {
    revalidatePath(`/customers/${customerId}`);
  }
}
