"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";
import { WIN_CATEGORIES } from "@/lib/types";

export type GoalsFormState = {
  error?: string;
  success?: string;
};

export async function updateGoals(
  _prevState: GoalsFormState,
  formData: FormData
): Promise<GoalsFormState> {
  const goalCustomers = Number(formData.get("goal_customers") ?? "");
  const goalRevenue = Number(formData.get("goal_monthly_revenue") ?? "");
  const savingsLabel = String(formData.get("savings_goal_label") ?? "").trim();
  const savingsCurrent = Number(formData.get("savings_current") ?? "");
  const savingsTarget = Number(formData.get("savings_target") ?? "");

  const { supabase, business } = await requireUserAndBusiness();

  const { error } = await supabase
    .from("businesses")
    .update({
      goal_customers: Number.isFinite(goalCustomers) && goalCustomers > 0 ? goalCustomers : null,
      goal_monthly_revenue: Number.isFinite(goalRevenue) && goalRevenue > 0 ? goalRevenue : null,
      savings_goal_label: savingsLabel || null,
      savings_current: Number.isFinite(savingsCurrent) ? savingsCurrent : null,
      savings_target: Number.isFinite(savingsTarget) && savingsTarget > 0 ? savingsTarget : null,
    })
    .eq("id", business.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/goals");
  return { success: "Goals updated." };
}

export async function addWin(
  _prevState: GoalsFormState,
  formData: FormData
): Promise<GoalsFormState> {
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "other").trim();
  const details = String(formData.get("details") ?? "").trim();

  if (!title) {
    return { error: "Win title is required." };
  }

  const { supabase, business } = await requireUserAndBusiness();

  const { error } = await supabase.from("wins").insert({
    business_id: business.id,
    title,
    category: WIN_CATEGORIES.some((c) => c.value === category) ? category : "other",
    details: details || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/goals");
  return { success: "Win logged." };
}

export async function deleteWin(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, business } = await requireUserAndBusiness();

  await supabase
    .from("wins")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id);

  revalidatePath("/goals");
}

export type RowEditState = { error?: string; success?: string; savedAt?: number };

// Edit a win's title, details and kind.
export async function updateWin(_prev: RowEditState, formData: FormData): Promise<RowEditState> {
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 300);
  const details = String(formData.get("details") ?? "").trim().slice(0, 2000);
  const category = String(formData.get("category") ?? "other");
  if (!id) return { error: "Missing win." };
  if (!title) return { error: "What did you win?" };

  const { supabase, business } = await requireUserAndBusiness();
  const { error } = await supabase
    .from("wins")
    .update({
      title,
      details: details || null,
      category: WIN_CATEGORIES.some((c) => c.value === category) ? category : "other",
    })
    .eq("id", id)
    .eq("business_id", business.id);
  if (error) return { error: error.message };
  revalidatePath("/goals");
  return { success: "Saved.", savedAt: Date.now() };
}
