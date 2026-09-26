"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness, belongsToBusiness } from "@/lib/data";
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from "@/lib/types";
import { addMonths } from "@/lib/recurring";
import { checkPlanLimit } from "@/lib/plan-limits";

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

// Allowed receipt file extensions -> the MIME types each may carry
const RECEIPT_TYPES: Record<string, string[]> = {
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  pdf: ["application/pdf"],
};

export type TransactionFormState = {
  error?: string;
  success?: string;
  upgrade?: boolean;
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

  if (customerId && !(await belongsToBusiness(supabase, "customers", customerId, business.id))) {
    return { error: "That customer wasn't found." };
  }

  // Upload the receipt first (if provided) so we can store its path
  let receiptPath: string | null = null;
  if (receipt instanceof File && receipt.size > 0) {
    if (receipt.size > MAX_RECEIPT_BYTES) {
      return { error: "Receipt file is too large (max 10MB)." };
    }
    // Both the file extension and the browser-reported type must be on
    // the allow-list, and they must agree.
    const ext = (receipt.name.split(".").pop() ?? "").toLowerCase();
    const allowedMimes = RECEIPT_TYPES[ext];
    if (!allowedMimes || !allowedMimes.includes(receipt.type)) {
      return { error: "Receipts must be a JPG, PNG, WEBP or PDF file." };
    }
    const limited = await checkPlanLimit(supabase, business, "storage", { bytes: receipt.size });
    if (limited) return limited;
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("receipts")
      .upload(path, receipt, {
        contentType: receipt.type,
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

export type RowEditState = { error?: string; success?: string; savedAt?: number };

// Edit an income / expense line.
export async function updateTransaction(_prev: RowEditState, formData: FormData): Promise<RowEditState> {
  const id = String(formData.get("id") ?? "");
  const amount = Number(String(formData.get("amount") ?? "").replace(",", "."));
  const category = String(formData.get("category") ?? "");
  const description = String(formData.get("description") ?? "").trim().slice(0, 500);
  const date = String(formData.get("date") ?? "").trim();
  if (!id) return { error: "Missing entry." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount greater than 0." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date." };

  const { supabase, business } = await requireUserAndBusiness();
  const { data: tx } = await supabase
    .from("transactions")
    .select("type")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!tx) return { error: "Entry not found." };
  const valid = tx.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const { error } = await supabase
    .from("transactions")
    .update({
      amount: Math.round(amount * 100) / 100,
      category: valid.some((c) => c.value === category) ? category : valid[valid.length - 1].value,
      description: description || null,
      date,
    })
    .eq("id", id)
    .eq("business_id", business.id);
  if (error) return { error: error.message };
  revalidatePath("/money");
  revalidatePath("/dashboard");
  return { success: "Saved.", savedAt: Date.now() };
}

// Edit a monthly repeat: amount, description, next date.
export async function updateRecurring(_prev: RowEditState, formData: FormData): Promise<RowEditState> {
  const id = String(formData.get("id") ?? "");
  const amount = Number(String(formData.get("amount") ?? "").replace(",", "."));
  const description = String(formData.get("description") ?? "").trim().slice(0, 500);
  const next = String(formData.get("next_date") ?? "").trim();
  if (!id) return { error: "Missing entry." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount greater than 0." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return { error: "Pick the next date." };

  const { supabase, business } = await requireUserAndBusiness();
  const { error } = await supabase
    .from("recurring_transactions")
    .update({ amount: Math.round(amount * 100) / 100, description: description || null, next_date: next })
    .eq("id", id)
    .eq("business_id", business.id);
  if (error) return { error: error.message };
  revalidatePath("/money");
  return { success: "Saved.", savedAt: Date.now() };
}
