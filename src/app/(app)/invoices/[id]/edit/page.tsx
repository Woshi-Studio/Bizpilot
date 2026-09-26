import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserAndBusiness } from "@/lib/data";
import type { InvoiceItem, PaymentMethod } from "@/lib/types";
import InvoiceForm, { type EditableInvoice } from "../../invoice-form";
import { loadBusinessLines } from "@/lib/activities";
import { loadLineSettings, loadPickableServices } from "@/lib/services-data";

export const metadata = { title: "Edit invoice" };

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, business } = await requireUserAndBusiness();

  const { data } = await supabase
    .from("invoices")
    .select("*, invoice_items(*)")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!data) notFound();

  const row = data as EditableInvoice & { invoice_items: InvoiceItem[] };
  const invoice: EditableInvoice = {
    id: row.id,
    number: row.number,
    doc_type: row.doc_type,
    customer_id: row.customer_id,
    issue_date: row.issue_date,
    due_date: row.due_date,
    notes: row.notes,
    business_line: row.business_line ?? null,
    currency: row.currency ?? null,
    tax_label: row.tax_label ?? null,
    tax_rate: row.tax_rate ?? 0,
    items: [...row.invoice_items]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        description: i.description,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
      })),
  };

  const [{ data: customers }, paymentMethodsResult, lines, services, lineSettings] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, business_line")
      .eq("business_id", business.id)
      .order("name"),
    supabase
      .from("payment_methods")
      .select("*")
      .eq("business_id", business.id)
      .order("position"),
    loadBusinessLines(supabase, business.id),
    loadPickableServices(supabase, business.id),
    loadLineSettings(supabase, business.id),
  ]);

  return (
    <div className="mx-auto max-w-6xl [&>*]:max-w-2xl">
      <Link href={`/invoices/${id}`} className="text-sm text-slate-500 hover:text-slate-700">
        &larr; Back to {invoice.doc_type === "quote" ? "quote" : "invoice"}
      </Link>
      <h1 className="mt-2 page-title">
        Edit {invoice.doc_type === "quote" ? "quote" : "invoice"} {invoice.number}
      </h1>
      <div className="mt-6">
        <InvoiceForm
          invoice={invoice}
          customers={customers ?? []}
          currency={business.currency}
          paymentMethods={paymentMethodsResult.error ? [] : ((paymentMethodsResult.data ?? []) as PaymentMethod[])}
          lines={lines}
          services={services}
          lineSettings={lineSettings}
        />
      </div>
    </div>
  );
}
