import Link from "next/link";
import Icon from "@/components/icons";
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

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-sub">Everyone you work with, and when to follow up.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <a href="/leads/export?what=customers" className="btn-secondary" download>
            ⬇ Download CSV
          </a>
          <Link href="/customers/new" className="btn-primary">
            <Icon name="plus" className="h-4 w-4" />
            Add customer
          </Link>
        </div>
      </div>

      <div className="mt-6">
        <BusinessLineFilter basePath="/customers" lines={lines} current={line} />
      </div>

      <div className="mt-5">
        <CustomersList customers={(customers ?? []) as Customer[]} today={today} />
      </div>
    </div>
  );
}
