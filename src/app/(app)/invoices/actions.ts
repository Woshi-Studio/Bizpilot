"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUserAndBusiness, isMissingColumnError } from "@/lib/data";
import { normalizeLine } from "@/lib/business-lines";
import { logActivity } from "@/lib/activities";
import { checkLineLimit, checkPlanLimit, planLimitFromError } from "@/lib/plan-limits";
import { invoiceTotals, isCurrency } from "@/lib/line-settings";
import type { Business } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type InvoiceFormState = {
  error?: string;
  upgrade?: boolean;
};

type ItemInput = {
  description: string;
  quantity: number;
  unit_price: number;
};

type ParsedInvoice = {
  docType: "invoice" | "quote";
  customerId: string;
  issueDate: string;
  dueDate: string;
  notes: string;
  items: ItemInput[];
  // 0017 columns
  extras: { currency: string | null; tax_label: string | null; tax_rate: number };
};

// Reads and checks the invoice form (new and edit).
function parseInvoiceForm(formData: FormData): ParsedInvoice | { error: string } {
  const docType = String(formData.get("doc_type") ?? "invoice");
  const customerId = String(formData.get("customer_id") ?? "").trim();
  const issueDate =
    String(formData.get("issue_date") ?? "").trim() ||
    new Date().toISOString().slice(0, 10);
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const itemsRaw = String(formData.get("items") ?? "[]");
  const currencyRaw = String(formData.get("currency") ?? "").trim();
  const taxLabel = String(formData.get("tax_label") ?? "").trim().slice(0, 30);
  const taxRate = Number(formData.get("tax_rate") ?? 0);

  if (docType !== "invoice" && docType !== "quote") {
    return { error: "Invalid document type." };
  }
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 30) {
    return { error: "Tax must be between 0 and 30%." };
  }

  let items: ItemInput[];
  try {
    items = JSON.parse(itemsRaw);
  } catch {
    return { error: "Invalid items." };
  }

  items = (Array.isArray(items) ? items : [])
    .map((i) => ({
      description: String(i.description ?? "").trim().slice(0, 500),
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

  return {
    docType,
    customerId,
    issueDate,
    dueDate,
    notes,
    items,
    extras: {
      currency: isCurrency(currencyRaw) ? currencyRaw : null,
      tax_label: taxRate > 0 ? taxLabel || "Tax" : null,
      tax_rate: taxRate > 0 ? Math.round(taxRate * 100) / 100 : 0,
    },
  };
}

// The business line to store: the one picked, else the customer's.
async function resolveLine(
  supabase: SupabaseClient,
  business: Business,
  customerId: string,
  formData: FormData
): Promise<{ line: string | null } | { error: string }> {
  let line = normalizeLine(formData.get("business_line"));
  if (customerId) {
    const { data: customer } = await supabase
      .from("customers")
      .select("id, business_line")
      .eq("id", customerId)
      .eq("business_id", business.id)
      .maybeSingle();
    if (!customer) return { error: "That customer wasn't found." };
    line ??= (customer as { business_line?: string | null }).business_line ?? null;
  }
  return { line };
}

function itemRows(invoiceId: string, items: ItemInput[]) {
  return items.map((i, idx) => ({
    invoice_id: invoiceId,
    description: i.description,
    quantity: Math.round(i.quantity * 100) / 100,
    unit_price: Math.round(i.unit_price * 100) / 100,
    position: idx,
  }));
}

export async function createInvoice(
  _prevState: InvoiceFormState,
  formData: FormData
): Promise<InvoiceFormState> {
  const parsed = parseInvoiceForm(formData);
  if ("error" in parsed) return parsed;
  const { docType, customerId, issueDate, dueDate, notes, items, extras } = parsed;

  const { supabase, business } = await requireUserAndBusiness();

  const resolved = await resolveLine(supabase, business, customerId, formData);
  if ("error" in resolved) return resolved;
  const businessLine = resolved.line;

  const limited =
    (await checkPlanLimit(supabase, business, "docs")) ??
    (await checkLineLimit(supabase, business, businessLine));
  if (limited) return limited;

  // Sequential number per document type: INV-0001 / QUO-0001
  const { count } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("business_id", business.id)
    .eq("doc_type", docType);

  const prefix = docType === "invoice" ? "INV" : "QUO";
  const number = `${prefix}-${String((count ?? 0) + 1).padStart(4, "0")}`;

  const base = {
    business_id: business.id,
    customer_id: customerId || null,
    number,
    doc_type: docType,
    issue_date: issueDate,
    due_date: dueDate || null,
    notes: notes || null,
    business_line: businessLine,
  };
  const insert = (row: object) => supabase.from("invoices").insert(row).select("id").single();
  let { data: invoice, error } = await insert({ ...base, ...extras });
  // Before 0017: no currency / tax columns yet.
  if (isMissingColumnError(error)) ({ data: invoice, error } = await insert(base));

  if (error || !invoice) {
    return planLimitFromError(error, business) ?? { error: error?.message ?? "Couldn't save." };
  }

  const { error: itemsError } = await supabase
    .from("invoice_items")
    .insert(itemRows(invoice.id, items));

  if (itemsError) {
    return { error: itemsError.message };
  }

  const { total } = invoiceTotals(items, extras.tax_rate);
  await logActivity(supabase, {
    business_id: business.id,
    customer_id: customerId || null,
    business_line: businessLine,
    kind: "invoice",
    subject: `${docType === "quote" ? "Quote" : "Invoice"} ${number} created`,
    body: `Total ${total.toFixed(2)} ${extras.currency ?? business.currency}${dueDate ? ` · due ${dueDate}` : ""}`,
  });
  if (customerId) revalidatePath(`/customers/${customerId}`);
  revalidatePath("/calendar");

  revalidatePath("/invoices");
  redirect(`/invoices/${invoice.id}`);
}

// Edit an invoice or quote: its details and all its lines.
export async function updateInvoice(
  _prevState: InvoiceFormState,
  formData: FormData
): Promise<InvoiceFormState> {
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Missing invoice." };
  const parsed = parseInvoiceForm(formData);
  if ("error" in parsed) return parsed;
  const { customerId, issueDate, dueDate, notes, items, extras } = parsed;

  const { supabase, business } = await requireUserAndBusiness();

  const { data: existing } = await supabase
    .from("invoices")
    .select("id, business_line")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!existing) return { error: "That invoice wasn't found." };

  const resolved = await resolveLine(supabase, business, customerId, formData);
  if ("error" in resolved) return resolved;
  const businessLine = resolved.line;
  if (businessLine && businessLine !== existing.business_line) {
    const limited = await checkLineLimit(supabase, business, businessLine);
    if (limited) return limited;
  }

  const base = {
    customer_id: customerId || null,
    issue_date: issueDate,
    due_date: dueDate || null,
    notes: notes || null,
    business_line: businessLine,
  };
  const update = (row: object) =>
    supabase.from("invoices").update(row).eq("id", id).eq("business_id", business.id);
  let { error } = await update({ ...base, ...extras });
  if (isMissingColumnError(error)) ({ error } = await update(base));
  if (error) return planLimitFromError(error, business) ?? { error: error.message };

  // Replace the lines (RLS lets only this business touch them).
  const { error: delError } = await supabase.from("invoice_items").delete().eq("invoice_id", id);
  if (delError) return { error: delError.message };
  const { error: itemsError } = await supabase.from("invoice_items").insert(itemRows(id, items));
  if (itemsError) return { error: itemsError.message };

  if (customerId) revalidatePath(`/customers/${customerId}`);
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  redirect(`/invoices/${id}`);
}

export async function setInvoiceStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["draft", "sent", "accepted", "paid"].includes(status)) return;

  const { supabase, business } = await requireUserAndBusiness();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, invoice_items(quantity, unit_price)")
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
    // Tax included (0017); older invoices have none.
    const { total } = invoiceTotals(
      (invoice.invoice_items ?? []) as { quantity: number; unit_price: number }[],
      (invoice as { tax_rate?: number | null }).tax_rate ?? 0
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
