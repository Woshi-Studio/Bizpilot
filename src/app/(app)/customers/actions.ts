"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  requireUserAndBusiness,
  isMissingColumnError,
  optionalText,
} from "@/lib/data";
import { CUSTOMER_STATUSES } from "@/lib/types";
import { normalizeLine } from "@/lib/business-lines";
import { logActivity } from "@/lib/activities";
import { checkLineLimit, checkPlanLimit, planLimitFromError } from "@/lib/plan-limits";

export type CustomerFormState = {
  error?: string;
  success?: string;
  upgrade?: boolean;
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
    business_line: normalizeLine(formData.get("business_line")),
    // 0015 columns — dropped again by withoutExtras() if not migrated yet
    address: optionalText(formData, "address", 300),
    website: optionalText(formData, "website", 300),
  };
}

function withoutExtras<T extends { address?: unknown; website?: unknown }>(v: T) {
  const rest = { ...v };
  delete rest.address;
  delete rest.website;
  return rest;
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

  const limited =
    (await checkPlanLimit(supabase, business, "contacts")) ??
    (await checkLineLimit(supabase, business, values.business_line));
  if (limited) return limited;

  const insert = (v: typeof values | ReturnType<typeof withoutExtras<typeof values>>) =>
    supabase
      .from("customers")
      .insert({ ...v, business_id: business.id })
      .select("id")
      .single();
  let { data, error } = await insert(values);
  if (isMissingColumnError(error)) ({ data, error } = await insert(withoutExtras(values)));

  if (error || !data) {
    return planLimitFromError(error, business) ?? { error: error?.message ?? "Couldn't save the customer." };
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

  const { data: before } = await supabase
    .from("customers")
    .select("business_line")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (values.business_line && values.business_line !== before?.business_line) {
    const limited = await checkLineLimit(supabase, business, values.business_line);
    if (limited) return limited;
  }

  const update = (v: object) =>
    supabase.from("customers").update(v).eq("id", id).eq("business_id", business.id);
  let { error } = await update(values);
  if (isMissingColumnError(error)) ({ error } = await update(withoutExtras(values)));

  if (error) {
    return planLimitFromError(error, business) ?? { error: error.message };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { success: "Customer saved." };
}

export async function deleteCustomer(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, business } = await requireUserAndBusiness();

  // Remove the customer's stored files first; the documents rows go with
  // the customer (on delete cascade), but storage files would be orphaned.
  const { data: docs } = await supabase
    .from("documents")
    .select("path")
    .eq("customer_id", id)
    .eq("business_id", business.id);
  if (docs && docs.length > 0) {
    await supabase.storage
      .from("client-docs")
      .remove(docs.map((d) => d.path as string));
  }

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
    .select("id, business_line")
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

  await logActivity(supabase, {
    business_id: business.id,
    customer_id: customerId,
    business_line:
      (customer as { business_line?: string | null }).business_line ?? null,
    kind: "note",
    body,
  });

  revalidatePath(`/customers/${customerId}`);
  return { success: "Note added." };
}

export async function setFollowUpIn(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const days = Number(formData.get("days") ?? 0);
  if (!id || !Number.isFinite(days)) return;

  const { supabase, business } = await requireUserAndBusiness();

  const target = new Date();
  target.setDate(target.getDate() + days);

  await supabase
    .from("customers")
    .update({ next_follow_up: target.toISOString().slice(0, 10) })
    .eq("id", id)
    .eq("business_id", business.id);

  revalidatePath(`/customers/${id}`);
  revalidatePath("/customers");
  revalidatePath("/dashboard");
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
