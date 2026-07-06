"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from "@/lib/types";
import { addMonths } from "@/lib/recurring";

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
  const date =
    String(formData.get("date") ?? "").trim() ||
    new Date().toISOString().slice(0, 10);
  const customerId = String(formData.get("customer_id") ?? "").trim();
  const repeatsMonthly = formData.get("repeats_monthly") === "on";
  const receipt = formData.get("receipt");

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

  const { supabase, user, business } = await requireUserAndBusiness();

  // Upload the receipt first (if provided) so we can store its path
  let receiptPath: string | null = null;
  if (receipt instanceof File && receipt.size > 0) {
    if (receipt.size > 6 * 1024 * 1024) {
      return { error: "Receipt file is too large (max 6MB)." };
    }
    const ext = (receipt.name.split(".").pop() ?? "jpg").toLowerCase();
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("receipts")
      .upload(path, receipt, {
        contentType: receipt.type || "application/octet-stream",
      });
    if (uploadError) {
      return { error: `Receipt upload failed: ${uploadError.message}` };
    }
    receiptPath = path;
  }

  const { error } = await supabase.from("transactions").insert({
    business_id: business.id,
    type,
    amount: Math.round(amount * 100) / 100,
    category: safeCategory,
    description: description || null,
    date,
    customer_id: customerId || null,
    receipt_path: receiptPath,
  });

  if (error) {
    return { error: error.message };
  }

  if (repeatsMonthly) {
    await supabase.from("recurring_transactions").insert({
      business_id: business.id,
      customer_id: customerId || null,
      type,
      amount: Math.round(amount * 100) / 100,
      category: safeCategory,
      description: description || null,
      next_date: addMonths(date, 1),
    });
  }

  revalidatePath("/money");
  revalidatePath("/dashboard");
  return { success: "Added." };
}

export async function deleteTransaction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, business } = await requireUserAndBusiness();

  // Clean up the attached receipt file, if any
  const { data: tx } = await supabase
    .from("transactions")
    .select("receipt_path")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();

  await supabase
    .from("transactions")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id);

  if (tx?.receipt_path) {
    await supabase.storage.from("receipts").remove([tx.receipt_path]);
  }

  revalidatePath("/money");
  revalidatePath("/dashboard");
}

export async function deleteRecurring(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, business } = await requireUserAndBusiness();

  await supabase
    .from("recurring_transactions")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id);

  revalidatePath("/money");
}
