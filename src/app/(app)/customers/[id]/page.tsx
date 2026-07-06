import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserAndBusiness } from "@/lib/data";
import { formatMoney, type Customer, type CustomerNote } from "@/lib/types";
import CustomerForm from "../customer-form";
import { updateCustomer, setFollowUpIn } from "../actions";
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

  const [{ data: notes }, { data: customerTxs }] = await Promise.all([
    supabase
      .from("customer_notes")
      .select("*")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("transactions")
      .select("type, amount")
      .eq("customer_id", id),
  ]);

  const revenue = (customerTxs ?? [])
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);

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

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {revenue > 0 && (
          <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 font-medium text-green-700">
            {formatMoney(revenue, business.currency)} earned from this customer
          </span>
        )}
        <span className="text-slate-500">
          Follow-up:{" "}
          <span className="font-medium text-slate-700">
            {customer.next_follow_up ?? "not set"}
          </span>
        </span>
        <form action={setFollowUpIn} className="inline-flex gap-1.5">
          <input type="hidden" name="id" value={customer.id} />
          <button
            type="submit"
            name="days"
            value="7"
            className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-600"
          >
            +1 week
          </button>
          <button
            type="submit"
            name="days"
            value="30"
            className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-600"
          >
            +1 month
          </button>
        </form>
        <Link
          href={`/messages?customer=${customer.id}`}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          ✨ Write them a message
        </Link>
      </div>

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
