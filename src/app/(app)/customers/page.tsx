import Link from "next/link";
import { requireUserAndBusiness } from "@/lib/data";
import type { Customer } from "@/lib/types";
import CustomersList from "./customers-list";
import BusinessLineFilter from "@/components/business-line-filter";
import { loadBusinessLines, withLine } from "@/lib/activities";
import { lineFromParam } from "@/lib/business-lines";

export const metadata = { title: "Customers" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ line?: string }>;
}) {
  const { supabase, business } = await requireUserAndBusiness();
  const line = lineFromParam((await searchParams).line);

  const [{ data: customers }, lines] = await Promise.all([
    withLine(
      supabase.from("customers").select("*").eq("business_id", business.id),
      line
    ).order("name"),
    loadBusinessLines(supabase, business.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Everyone you work with, and when to follow up.
          </p>
        </div>
        <Link
          href="/customers/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          + Add customer
        </Link>
      </div>

      <div className="mt-4">
        <BusinessLineFilter basePath="/customers" lines={lines} current={line} />
      </div>

      <div className="mt-6">
        <CustomersList customers={(customers ?? []) as Customer[]} />
      </div>
    </div>
  );
}
