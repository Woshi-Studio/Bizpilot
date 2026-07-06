"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from "@/lib/types";

export type TransactionFormState = {
  error?: string;
  success?: string;
};

export async function createTransaction(
  _prevState: TransactionFormState,
  formData: FormData
): Promise<TransactionFormState> {
  const type = String(formData.get("type") ?? "");
  const amountRaw = String(formData.get("amount") ?? "").replace(",", ".");
  const category = String(formData.get("category") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const customerId = String(formData.get("customer_id") ?? "").trim();

  if (type !== "income" && type !== "expense") {
    return { error: "Pick income or expense." };
  }

  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    return { error: "Enter a valid amount greater than 0." };
  }

  const validCategories =
    type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const safeCategory = validCategories.some((c) => c.value === category)
    ? category
    : validCategories[validCategories.length - 1].value;

  const { supabase, business } = await requireUserAndBusiness();

  const { error } = await supabase.from("transactions").insert({
    business_id: business.id,
    type,
    amount: Math.round(amount * 100) / 100,
    category: safeCategory,
    description: description || null,
    date: date || new Date().toISOString().slice(0, 10),
    customer_id: customerId || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/money");
  revalidatePath("/dashboard");
  return { success: "Added." };
}

export async function deleteTransaction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, business } = await requireUserAndBusiness();

  await supabase
    .from("transactions")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id);

  revalidatePath("/money");
  revalidatePath("/dashboard");
}
