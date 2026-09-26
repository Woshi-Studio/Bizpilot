import { requireUserAndBusiness } from "@/lib/data";
import type { Service } from "@/lib/types";
import ServiceForm from "./service-form";
import ServicesList from "./services-list";
import BusinessLineFilter from "@/components/business-line-filter";
import { loadBusinessLines, withLine } from "@/lib/activities";
import { NO_LINE, lineFromParam } from "@/lib/business-lines";

export const metadata = { title: "Pricing" };

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ line?: string }>;
}) {
  const { supabase, business } = await requireUserAndBusiness();
  const line = lineFromParam((await searchParams).line);

  const [{ data: services }, lines] = await Promise.all([
    withLine(
      supabase.from("services").select("*").eq("business_id", business.id),
      line
    ).order("name"),
    loadBusinessLines(supabase, business.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">Pricing</h1>
      <p className="mt-1 text-sm text-slate-500">
        Your rate card. Pick these when creating a task so the value fills in
        automatically.
      </p>

      <div className="mt-4">
        <BusinessLineFilter basePath="/services" lines={lines} current={line} />
      </div>

      <div className="mt-6">
        <ServiceForm
          lines={lines}
          defaultLine={line && line !== NO_LINE ? line : undefined}
        />
      </div>

      <div className="mt-6">
        <ServicesList
          services={(services ?? []) as Service[]}
          currency={business.currency}
        />
      </div>
    </div>
  );
}
