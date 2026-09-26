import Link from "next/link";
import CustomerForm from "../customer-form";
import { createCustomer } from "../actions";
import FormError from "@/components/form-error";
import { requireUserAndBusiness } from "@/lib/data";
import { checkPlanLimit } from "@/lib/plan-limits";

export const metadata = { title: "Add customer" };

export default async function NewCustomerPage() {
  // Already at the plan's contact limit? Say so before they fill the form.
  const { supabase, business } = await requireUserAndBusiness();
  const limited = await checkPlanLimit(supabase, business, "contacts");

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

      {limited && <FormError className="mt-4" error={limited.error} upgrade={limited.upgrade} />}

      <div className="mt-6 card p-6">
        <CustomerForm action={createCustomer} submitLabel="Add customer" />
      </div>
    </div>
  );
}
