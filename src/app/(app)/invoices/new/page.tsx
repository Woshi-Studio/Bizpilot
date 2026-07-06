import Link from "next/link";
import { requireUserAndBusiness } from "@/lib/data";
import InvoiceForm from "../invoice-form";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage() {
  const { supabase, business } = await requireUserAndBusiness();

  const { data: customers } = await supabase
    .from("customers")
    .select("id, name")
    .eq("business_id", business.id)
    .order("name");

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/invoices"
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        &larr; Back to invoices
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">
        New invoice or quote
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Create it, print it as a PDF, get paid.
      </p>

      <div className="mt-6">
        <InvoiceForm
          customers={customers ?? []}
          currency={business.currency}
        />
      </div>
    </div>
  );
}
