import Link from "next/link";
import CustomerForm from "../customer-form";
import { createCustomer } from "../actions";

export const metadata = { title: "Add customer" };

export default function NewCustomerPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/customers"
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        &larr; Back to customers
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Add customer</h1>
      <p className="mt-1 text-sm text-slate-500">
        Only the name is required — you can fill in the rest later.
      </p>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <CustomerForm action={createCustomer} submitLabel="Add customer" />
      </div>
    </div>
  );
}
