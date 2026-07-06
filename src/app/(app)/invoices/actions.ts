"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";

export type InvoiceFormState = {
  error?: string;
};

type ItemInput = {
  description: string;
  quantity: number;
  unit_price: number;
};

export async function createInvoice(
  _prevState: InvoiceFormState,
  formData: FormData
): Promise<InvoiceFormState> {
  const docType = String(formData.get("doc_type") ?? "invoice");
  const customerId = String(formData.get("customer_id") ?? "").trim();
  const issueDate =
    String(formData.get("issue_date") ?? "").trim() ||
    new Date().toISOString().slice(0, 10);
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const itemsRaw = String(formData.get("items") ?? "[]");

  if (docType !== "invoice" && docType !== "quote") {
    return { error: "Invalid document type." };
  }

  let items: ItemInput[];
  try {
    items = JSON.parse(itemsRaw);
  } catch {
    return { error: "Invalid items." };
  }

  items = (items ?? [])
    .map((i) => ({
      description: String(i.description ?? "").trim(),
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
    }))
    .filter(
      (i) =>
        i.description &&
        Number.isFinite(i.quantity) &&
        i.quantity > 0 &&
        Number.isFinite(i.unit_price) &&
        i.unit_price >= 0
    );

  if (items.length === 0) {
    return { error: "Add at least one line item with a description and price." };
  }

  const { supabase, business } = await requireUserAndBusiness();

  // Sequential number per document type: INV-0001 / QUO-0001
  const { count } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("business_id", business.id)
    .eq("doc_type", docType);

  const prefix = docType === "invoice" ? "INV" : "QUO";
  const number = `${prefix}-${String((count ?? 0) + 1).padStart(4, "0")}`;

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      business_id: business.id,
      customer_id: customerId || null,
      number,
      doc_type: docType,
      issue_date: issueDate,
      due_date: dueDate || null,
      notes: notes || null,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  const { error: itemsError } = await supabase.from("invoice_items").insert(
    items.map((i, idx) => ({
      invoice_id: invoice.id,
      description: i.description,
      quantity: Math.round(i.quantity * 100) / 100,
      unit_price: Math.round(i.unit_price * 100) / 100,
      position: idx,
    }))
  );

  if (itemsError) {
    return { error: itemsError.message };
  }

  revalidatePath("/invoices");
  redirect(`/invoices/${invoice.id}`);
}

export async function setInvoiceStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["draft", "sent", "accepted", "paid"].includes(status)) return;

  const { supabase, business } = await requireUserAndBusiness();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, number, doc_type, status, customer_id, invoice_items(quantity, unit_price)")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();

  if (!invoice) return;

  await supabase
    .from("invoices")
    .update({ status })
    .eq("id", id)
    .eq("business_id", business.id);

  // Marking an invoice paid logs the income automatically
  if (
    status === "paid" &&
    invoice.status !== "paid" &&
    invoice.doc_type === "invoice"
  ) {
    const total = (invoice.invoice_items ?? []).reduce(
      (sum: number, i: { quantity: number; unit_price: number }) =>
        sum + Number(i.quantity) * Number(i.unit_price),
      0
    );
    if (total > 0) {
      await supabase.from("transactions").insert({
        business_id: business.id,
        customer_id: invoice.customer_id,
        type: "income",
        amount: Math.round(total * 100) / 100,
        category: "project",
        description: `Invoice ${invoice.number}`,
        date: new Date().toISOString().slice(0, 10),
      });
    }
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/money");
  revalidatePath("/dashboard");
}

export async function deleteInvoice(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, business } = await requireUserAndBusiness();

  await supabase
    .from("invoices")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id);

  revalidatePath("/invoices");
  redirect("/invoices");
}
