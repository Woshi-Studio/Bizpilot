import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserAndBusiness } from "@/lib/data";
import type { Customer, CustomerNote } from "@/lib/types";
import CustomerForm from "../customer-form";
import { updateCustomer } from "../actions";
import NotesSection from "./notes-section";
import DeleteCustomerButton from "./delete-button";

export const metadata = { title: "Customer" };

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, business } = await requireUserAndBusiness();

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();

  if (!customer) {
    notFound();
  }

  const { data: notes } = await supabase
    .from("customer_notes")
    .select("*")
    .eq("customer_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <Link
          href="/customers"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          &larr; Back to customers
        </Link>
        <DeleteCustomerButton
          customerId={customer.id}
          customerName={customer.name}
        />
      </div>

      <h1 className="mt-2 text-2xl font-bold text-slate-900">
        {customer.name}
      </h1>
      {customer.company && (
        <p className="mt-0.5 text-sm text-slate-500">{customer.company}</p>
      )}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Details</h2>
        <CustomerForm
          action={updateCustomer}
          customer={customer as Customer}
          submitLabel="Save changes"
        />
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Notes</h2>
        <NotesSection
          customerId={customer.id}
          notes={(notes ?? []) as CustomerNote[]}
        />
      </div>
    </div>
  );
}
