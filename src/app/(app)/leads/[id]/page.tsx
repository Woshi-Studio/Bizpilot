import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserAndBusiness } from "@/lib/data";
import { LEAD_CHANNELS, LEAD_STATUSES, type Lead } from "@/lib/types";
import type { Activity } from "@/lib/activities";
import { loadBusinessLines } from "@/lib/activities";
import { lineLabel } from "@/lib/business-lines";
import Timeline from "@/components/timeline";
import LocalTime from "@/components/local-time";
import LeadForm from "../lead-form";
import { convertLead } from "../actions";

export const metadata = { title: "Lead" };

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, business } = await requireUserAndBusiness();

  const { data } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();

  if (!data) {
    notFound();
  }
  const lead = data as Lead;

  const [activitiesResult, lines, customerResult] = await Promise.all([
    supabase
      .from("activities")
      .select("*")
      .eq("business_id", business.id)
      .eq("lead_id", id)
      .order("occurred_at", { ascending: false })
      .limit(500),
    loadBusinessLines(supabase, business.id),
    lead.email
      ? supabase
          .from("customers")
          .select("id, name")
          .eq("business_id", business.id)
          .ilike("email", lead.email.replace(/[\\%_]/g, (m) => "\\" + m))
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const status = LEAD_STATUSES.find((s) => s.value === lead.status);
  const channel = LEAD_CHANNELS.find((c) => c.value === lead.channel);
  const customer = customerResult.data as { id: string; name: string } | null;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/leads" className="text-sm text-slate-500 hover:text-slate-700">
        &larr; Back to leads
      </Link>

      <h1 className="mt-2 text-2xl font-bold text-slate-900">{lead.name}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {status && (
          <span
            className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.badgeClass}`}
          >
            {status.label}
          </span>
        )}
        {lead.business_line && (
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600">
            {lineLabel(lead.business_line)}
          </span>
        )}
        <span className="text-slate-500">
          {channel?.label ?? lead.channel} · added{" "}
          <LocalTime iso={lead.created_at} mode="date" />
        </span>
        {customer ? (
          <Link
            href={`/customers/${customer.id}`}
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            Customer: {customer.name} &rarr;
          </Link>
        ) : (
          lead.status !== "converted" && (
            <form action={convertLead}>
              <input type="hidden" name="id" value={lead.id} />
              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
              >
                + Add to customers
              </button>
            </form>
          )
        )}
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Timeline</h2>
        <Timeline
          activities={(activitiesResult.data ?? []) as Activity[]}
          leadId={lead.id}
          missing={!!activitiesResult.error}
          nowIso={new Date().toISOString()}
        />
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Details</h2>
        <LeadForm lead={lead} lines={lines} />
      </div>
    </div>
  );
}
