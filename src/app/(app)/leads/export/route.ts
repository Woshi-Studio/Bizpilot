import { createClient } from "@/lib/supabase/server";
import { crmToRow, exportFileName, toCsv, type CrmRecord } from "@/lib/lead-export";

// CRM -> CSV, in the same columns as the Lead Finder export.
//   /leads/export                 leads + customers
//   /leads/export?what=leads      leads only
//   /leads/export?what=customers  customers only
// Only the signed-in user's own business (session + RLS + business_id).

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("owner_id", user.id)
    .eq("onboarding_completed", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!business) return new Response("No business", { status: 400 });

  const whatParam = new URL(request.url).searchParams.get("what");
  const what = whatParam === "leads" || whatParam === "customers" ? whatParam : "all";

  const [leads, customers] = await Promise.all([
    what === "customers"
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("leads").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).limit(10000),
    what === "leads"
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("customers").select("*").eq("business_id", business.id).order("name").limit(10000),
  ]);
  if (leads.error || customers.error) return new Response("Couldn't read your list", { status: 500 });

  const rows = [
    ...((customers.data ?? []) as CrmRecord[]).map((c) => crmToRow(c, "customer")),
    ...((leads.data ?? []) as CrmRecord[]).map((l) => crmToRow(l, "lead")),
  ];
  const label = what === "all" ? "leads and customers" : what;
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(business.name, label)}"`,
      "Cache-Control": "no-store",
    },
  });
}
