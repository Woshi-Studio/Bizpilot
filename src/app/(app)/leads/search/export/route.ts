import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/demo";
import { getFinderAccess } from "@/lib/finder-server";
import { exportFileName, resultToRow, toCsv, unlockTimes, type ExportableResult, type ExportRow } from "@/lib/lead-export";

// Lead Finder -> CSV. Only UNLOCKED results of the signed-in user's own
// business (the session + RLS + business_id filter). Locked results are
// never exported.
//   /leads/search/export            every unlocked result
//   /leads/search/export?id=<uuid>  one result
//   /leads/search/export?job=<uuid> one search / list / "Find me customers" run

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, plan")
    .eq("owner_id", user.id)
    .eq("onboarding_completed", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!business) return new Response("No business", { status: 400 });
  if (getFinderAccess(business) === "none") return new Response("Not available", { status: 403 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const job = url.searchParams.get("job") ?? "";
  if ((id && !UUID_RE.test(id)) || (job && !UUID_RE.test(job))) {
    return new Response("Bad request", { status: 400 });
  }

  let q = supabase
    .from("finder_results")
    .select("id, item_id, company_name, website, city, region, country, phone, email, email_checks, source_urls, locked, created_at")
    .eq("business_id", business.id)
    .eq("locked", false)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (id) q = q.eq("id", id);
  if (job) q = q.eq("job_id", job);
  const { data, error } = await q;
  if (error) return new Response("Couldn't read your results", { status: 500 });
  const results = (data ?? []) as (ExportableResult & { item_id: string | null })[];
  if (id && !results.length) return new Response("Not found", { status: 404 });

  // Person names (0020: server only) for this business's own items.
  const persons = new Map<string, string>();
  const itemIds = [...new Set(results.map((r) => r.item_id).filter((x): x is string => !!x))];
  const db = (isDemoMode() ? supabase : createAdminClient()) ?? supabase;
  for (let i = 0; i < itemIds.length; i += 200) {
    const { data: items } = await db
      .from("finder_job_items")
      .select("id, person")
      .eq("business_id", business.id)
      .in("id", itemIds.slice(i, i + 200));
    for (const it of (items ?? []) as { id: string; person?: string | null }[]) {
      if (it.person) persons.set(it.id, it.person);
    }
  }

  // When a saved locked result was unlocked (upgrade to Boss); else it was
  // unlocked when it was delivered.
  const { data: audit } = await supabase
    .from("finder_audit")
    .select("detail, created_at")
    .eq("business_id", business.id)
    .eq("action", "unlock")
    .order("created_at", { ascending: false })
    .limit(5000);
  const unlocked = unlockTimes((audit ?? []) as { detail: unknown; created_at: string }[]);

  const rows = results
    .map((r) => resultToRow({ ...r, contact_name: r.item_id ? persons.get(r.item_id) ?? null : null }, unlocked.get(r.id)))
    .filter((r): r is ExportRow => !!r);

  const what = id ? `lead ${rows[0]?.company ?? ""}`.trim() : job ? "search results" : "found leads";
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(business.name, what.replace(/[^a-z0-9-_ ]/gi, ""))}"`,
      "Cache-Control": "no-store",
    },
  });
}
