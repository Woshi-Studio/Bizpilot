import Link from "next/link";
import CustomerForm from "../customer-form";
import { createCustomer } from "../actions";

export const metadata = { title: "Add customer" };

export default function NewCustomerPage() {
  return (
    <div className="mx-auto max-w-6xl [&>*]:max-w-2xl">
      <Link
        href="/customers"
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        &larr; Back to customers
      </Link>
      <h1 className="mt-2 page-title">Add customer</h1>
      <p className="page-sub">
        Only the name is required — you can fill in the rest later.
      </p>

      <div className="mt-6 card p-6">
        <CustomerForm action={createCustomer} submitLabel="Add customer" />
      </div>
    </div>
  );
}
