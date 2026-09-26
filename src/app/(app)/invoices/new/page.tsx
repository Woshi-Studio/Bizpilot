import Link from "next/link";
import { requireUserAndBusiness } from "@/lib/data";
import type { PaymentMethod } from "@/lib/types";
import InvoiceForm from "../invoice-form";
import { loadBusinessLines } from "@/lib/activities";
import { loadLineSettings, loadPickableServices } from "@/lib/services-data";

const isId = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; type?: string }>;
}) {
  const { customer, type } = await searchParams;
  const { supabase, business } = await requireUserAndBusiness();

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

  const paymentMethods = paymentMethodsResult.error
    ? []
    : ((paymentMethodsResult.data ?? []) as PaymentMethod[]);

  return (
    <div className="mx-auto max-w-6xl [&>*]:max-w-2xl">
      <Link
        href="/invoices"
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        &larr; Back to invoices
      </Link>
      <h1 className="mt-2 page-title">
        {type === "quote" ? "New quote" : "New invoice"}
      </h1>
      <p className="page-sub">
        Create it, print it as a PDF, get paid.
      </p>

      <div className="mt-6">
        <InvoiceForm
          defaultCustomerId={isId(customer)}
          customers={customers ?? []}
          currency={business.currency}
          paymentMethods={paymentMethods}
          lines={lines}
          services={services}
          lineSettings={lineSettings}
          defaultDocType={type === "quote" ? "quote" : "invoice"}
        />
      </div>
    </div>
  );
}
