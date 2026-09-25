"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness, belongsToBusiness } from "@/lib/data";

export type TimeFormState = {
  error?: string;
  success?: string;
};

export async function logTime(
  _prevState: TimeFormState,
  formData: FormData
): Promise<TimeFormState> {
  const customerId = String(formData.get("customer_id") ?? "").trim();
  const taskId = String(formData.get("task_id") ?? "").trim();
  const hours = Number(formData.get("hours") ?? 0);
  const entryDate = String(formData.get("entry_date") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const billed = String(formData.get("billed") ?? "unbilled").trim();

  if (!Number.isFinite(hours) || hours <= 0) {
    return { error: "Hours must be a positive number." };
  }

  const { supabase, business } = await requireUserAndBusiness();

  if (customerId && !(await belongsToBusiness(supabase, "customers", customerId, business.id))) {
    return { error: "That customer wasn't found." };
  }
  if (taskId && !(await belongsToBusiness(supabase, "tasks", taskId, business.id))) {
    return { error: "That task wasn't found." };
  }

  const { error } = await supabase.from("time_entries").insert({
    business_id: business.id,
    customer_id: customerId || null,
    task_id: taskId || null,
    hours,
    entry_date: entryDate || new Date().toISOString().slice(0, 10),
    description: description || null,
    billed: ["unbilled", "billed", "included"].includes(billed)
      ? billed
      : "unbilled",
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/time");
  revalidatePath("/dashboard");
  return { success: "Hours logged." };
}

export async function deleteTimeEntry(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, business } = await requireUserAndBusiness();

  await supabase
    .from("time_entries")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id);

  revalidatePath("/time");
}

export async function setTimeBilled(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const billed = String(formData.get("billed") ?? "");
  if (!id || !["unbilled", "billed", "included"].includes(billed)) return;

  const { supabase, business } = await requireUserAndBusiness();

  await supabase
    .from("time_entries")
    .update({ billed })
    .eq("id", id)
    .eq("business_id", business.id);

  revalidatePath("/time");
}
