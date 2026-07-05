"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";

export type TaskFormState = {
  error?: string;
  success?: string;
};

export async function createTask(
  _prevState: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const title = String(formData.get("title") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const customerId = String(formData.get("customer_id") ?? "").trim();

  if (!title) {
    return { error: "Task title is required." };
  }

  const { supabase, business } = await requireUserAndBusiness();

  const { error } = await supabase.from("tasks").insert({
    business_id: business.id,
    title,
    due_date: dueDate || null,
    customer_id: customerId || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { success: "Task added." };
}

export async function toggleTask(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const completed = String(formData.get("completed") ?? "") === "true";
  if (!id) return;

  const { supabase, business } = await requireUserAndBusiness();

  await supabase
    .from("tasks")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("business_id", business.id);

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export async function deleteTask(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, business } = await requireUserAndBusiness();

  await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id);

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}
