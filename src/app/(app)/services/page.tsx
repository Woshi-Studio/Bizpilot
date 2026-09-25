import { requireUserAndBusiness } from "@/lib/data";
import type { Service } from "@/lib/types";
import ServiceForm from "./service-form";
import ServicesList from "./services-list";

export const metadata = { title: "Pricing" };

export default async function ServicesPage() {
  const { supabase, business } = await requireUserAndBusiness();

  const { data: services } = await supabase
    .from("services")
    .select("*")
    .eq("business_id", business.id)
    .order("name");

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">Pricing</h1>
      <p className="mt-1 text-sm text-slate-500">
        Your rate card. Pick these when creating a task so the value fills in
        automatically.
      </p>

      <div className="mt-6">
        <ServiceForm />
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
