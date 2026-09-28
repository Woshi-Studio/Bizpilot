// Lead Finder on the server. SERVER ONLY.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isDemoMode } from "@/lib/demo";
import { createAdminClient } from "@/lib/supabase/admin";
import { balanceOf, heldOf, type LedgerRow } from "@/lib/finder-credits";
import { finderAccess, visibleResult, type FinderAccess, type FinderResult } from "@/lib/finder";

type Biz = { id: string; plan?: string | null };

export function getFinderAccess(business: Biz): FinderAccess {
  if (isDemoMode()) {
    // DEMO_FINDER_ACCESS=full|locked|none previews another account (dev only)
    const d = process.env.DEMO_FINDER_ACCESS;
    return d === "full" || d === "locked" || d === "none" ? d : "owner";
  }
  return finderAccess(business.id, process.env, business.plan ?? null);
}

export type FinderProfile = {
  id: string;
  my_business: string | null;
  offer: string | null;
  target: string;
  industries: string[];
  industry_other?: string | null;
  company_sizes: string[];
  place: string | null;
  radius_km: number | null;
  province: string | null;
  area: string | null;
  country: string | null;
  needs: string[];
  exclude: string;
  aup_version: string;
  aup_accepted_at: string;
  updated_at: string;
};

const PROFILE_COLUMNS =
  "id, my_business, offer, target, industries, industry_other, company_sizes, place, radius_km, province, area, country, needs, exclude, aup_version, aup_accepted_at, updated_at";
// Before 0020 there are no `area` / `industry_other` columns.
const PROFILE_COLUMNS_0019 = PROFILE_COLUMNS.replace(" area,", "").replace(" industry_other,", "");

export async function loadProfile(supabase: SupabaseClient, businessId: string) {
  const read = (cols: string) =>
    supabase
      .from("finder_profiles")
      .select(cols)
      .eq("business_id", businessId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  let { data, error } = await read(PROFILE_COLUMNS);
  if (error && /area|industry_other/.test(error.message)) ({ data, error } = await read(PROFILE_COLUMNS_0019));
  return { profile: (data as unknown as FinderProfile | null) ?? null, ready: !error };
}

// The intake ("What are you hunting?") is filled in, not just the
// Acceptable Use tick.
export function intakeFilled(p: FinderProfile | null): boolean {
  return !!p?.my_business && !!p?.offer;
}

// Enough to run "Find me customers": the intake plus at least one kind of customer.
export function canDiscover(p: FinderProfile | null): boolean {
  return intakeFilled(p) && ((p?.industries?.length ?? 0) > 0 || !!p?.industry_other?.trim());
}

export type FinderCandidate = {
  kb_id?: string;
  name: string;
  city?: string | null;
  website?: string | null;
  source_url?: string | null;
};

export type FinderItem = {
  id: string;
  job_id: string;
  company: string;
  city: string | null;
  website: string | null;
  status: string;
  query_kind?: string | null;
  person?: string | null;
  candidates: FinderCandidate[] | null;
  note: string | null;
  created_at: string;
};

// What the "In progress" list shows: open items, plus misses from the last 7 days.
export function pendingItems(items: FinderItem[], now = Date.now()): FinderItem[] {
  const weekAgo = now - 7 * 86_400_000;
  return items.filter(
    (i) =>
      i.status === "queued" ||
      i.status === "working" ||
      i.status === "ambiguous" ||
      ((i.status === "not_found" || i.status === "failed") && Date.parse(i.created_at) > weekAgo)
  );
}

// A locked account sees the candidates' names and cities, never their websites.
export function visibleCandidates(c: FinderCandidate[] | null, locked: boolean): FinderCandidate[] | null {
  if (!c) return null;
  return locked ? c.map((x) => ({ kb_id: x.kb_id, name: x.name, city: x.city ?? null })) : c;
}

const RESULT_COLUMNS =
  "id, item_id, company_name, website, city, region, country, address, phone, phone_checks, email, email_checks, contact_form_url, source_urls, why, locked, last_checked_at, lead_id, created_at";

const ITEM_COLUMNS = "id, job_id, company, city, website, status, note, created_at, query_kind, person";

// Boss / owner: saved locked results (from before the upgrade) unlock, free.
async function unlockSaved(businessId: string) {
  const admin = createAdminClient();
  if (!admin) return;
  const { error } = await admin.rpc("finder_unlock_all", { p_business: businessId });
  if (error && !/does not exist|schema cache/i.test(error.message)) {
    console.error("finder_unlock_all failed:", error.message);
  }
}

export async function loadFinderPage(supabase: SupabaseClient, businessId: string, access: FinderAccess) {
  const locked = access === "locked";
  if ((access === "full" || access === "owner") && !isDemoMode()) {
    const { count } = await supabase
      .from("finder_results")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("locked", true);
    if ((count ?? 0) > 0) await unlockSaved(businessId);
  }

  const [results, items, ledger, reports] = await Promise.all([
    supabase
      .from("finder_results")
      .select(RESULT_COLUMNS)
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("finder_job_items")
      .select(ITEM_COLUMNS)
      .eq("business_id", businessId)
      .in("status", ["queued", "working", "ambiguous", "not_found", "failed"])
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("finder_credit_ledger").select("delta, reason, item_id, created_at").eq("business_id", businessId),
    supabase.from("finder_bounce_reports").select("result_id, status").eq("business_id", businessId),
  ]);

  const itemRows = (items.data ?? []) as FinderItem[];
  const resultRows = (results.data ?? []) as (FinderResult & { item_id?: string | null })[];

  // Candidates (0020: server only) and person names, read with the service
  // role for this business only. The session was checked by the caller.
  const extra = await loadItemExtras(
    supabase,
    businessId,
    itemRows.filter((i) => i.status === "ambiguous").map((i) => i.id),
    resultRows.map((r) => r.item_id).filter((x): x is string => !!x)
  );

  const rows = (ledger.data ?? []) as LedgerRow[];
  return {
    ready: !results.error,
    results: resultRows.map((r) => {
      const { item_id, ...rest } = r;
      const person = item_id ? extra.persons.get(item_id) ?? null : null;
      // Everything a locked card may not show is dropped here, on the server.
      return visibleResult({ ...rest, contact_name: person });
    }),
    items: itemRows.map((i) => ({ ...i, candidates: visibleCandidates(extra.candidates.get(i.id) ?? null, locked) })),
    balance: balanceOf(rows),
    held: heldOf(rows),
    reported: new Map(
      ((reports.data ?? []) as { result_id: string; status: string }[]).map((r) => [r.result_id, r.status])
    ),
  };
}

async function loadItemExtras(
  supabase: SupabaseClient,
  businessId: string,
  ambiguousIds: string[],
  resultItemIds: string[]
) {
  const candidates = new Map<string, FinderCandidate[]>();
  const persons = new Map<string, string>();
  if (!ambiguousIds.length && !resultItemIds.length) return { candidates, persons };
  // Demo mode and before 0020 the user's own session can read these.
  const db = (isDemoMode() ? supabase : createAdminClient()) ?? supabase;
  const ids = [...new Set([...ambiguousIds, ...resultItemIds])].slice(0, 200);
  const read = (cols: string) => db.from("finder_job_items").select(cols).eq("business_id", businessId).in("id", ids);
  let res = await read("id, candidates, person");
  if (res.error && /person/.test(res.error.message)) res = await read("id, candidates");
  for (const row of (res.data ?? []) as unknown as { id: string; candidates?: FinderCandidate[] | null; person?: string | null }[]) {
    if (row.candidates?.length) candidates.set(row.id, row.candidates);
    if (row.person) persons.set(row.id, row.person);
  }
  return { candidates, persons };
}

// Settings -> Lead Finder: the lead subscription's status (0020).
export type LeadSubStatus = {
  status: string;
  credits: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export async function loadLeadSub(supabase: SupabaseClient, businessId: string): Promise<LeadSubStatus | null> {
  const { data, error } = await supabase
    .from("finder_lead_subs")
    .select("status, credits, current_period_end, cancel_at_period_end")
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false })
    .limit(5);
  if (error || !data?.length) return null;
  const rows = data as LeadSubStatus[];
  return rows.find((r) => r.status === "active" || r.status === "trialing" || r.status === "past_due") ?? rows[0];
}

export async function loadCredits(supabase: SupabaseClient, businessId: string) {
  const { data, error } = await supabase
    .from("finder_credit_ledger")
    .select("delta, reason, item_id, created_at")
    .eq("business_id", businessId);
  if (error) return null;
  const rows = (data ?? []) as LedgerRow[];
  return { balance: balanceOf(rows), held: heldOf(rows) };
}
