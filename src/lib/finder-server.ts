// Lead Finder on the server. SERVER ONLY.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isDemoMode } from "@/lib/demo";
import { balanceOf, heldOf, type LedgerRow } from "@/lib/finder-credits";
import { finderAccess, type FinderAccess, type FinderResult } from "@/lib/finder";

export function getFinderAccess(businessId: string): FinderAccess {
  if (isDemoMode()) return "owner";
  return finderAccess(businessId, process.env);
}

export type FinderProfile = {
  id: string;
  my_business: string;
  offer: string;
  target: string;
  industries: string[];
  company_sizes: string[];
  place: string | null;
  radius_km: number | null;
  province: string | null;
  country: string | null;
  needs: string[];
  exclude: string;
  aup_version: string;
  aup_accepted_at: string;
  updated_at: string;
};

export const PROFILE_COLUMNS =
  "id, my_business, offer, target, industries, company_sizes, place, radius_km, province, country, needs, exclude, aup_version, aup_accepted_at, updated_at";

export async function loadProfile(supabase: SupabaseClient, businessId: string) {
  const { data, error } = await supabase
    .from("finder_profiles")
    .select(PROFILE_COLUMNS)
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { profile: (data as FinderProfile | null) ?? null, ready: !error };
}

export type FinderItem = {
  id: string;
  job_id: string;
  company: string;
  city: string | null;
  website: string | null;
  status: string;
  candidates: { kb_id?: string; name: string; city?: string | null; website?: string | null; source_url?: string | null }[] | null;
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

export const RESULT_COLUMNS =
  "id, company_name, website, city, region, country, address, phone, phone_checks, email, email_checks, contact_form_url, source_urls, why, locked, last_checked_at, lead_id, created_at";

export async function loadFinderPage(supabase: SupabaseClient, businessId: string) {
  const [results, items, ledger, reports] = await Promise.all([
    supabase
      .from("finder_results")
      .select(RESULT_COLUMNS)
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("finder_job_items")
      .select("id, job_id, company, city, website, status, candidates, note, created_at")
      .eq("business_id", businessId)
      .in("status", ["queued", "working", "ambiguous", "not_found", "failed"])
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("finder_credit_ledger").select("delta, reason, item_id, created_at").eq("business_id", businessId),
    supabase.from("finder_bounce_reports").select("result_id, status").eq("business_id", businessId),
  ]);

  const rows = (ledger.data ?? []) as LedgerRow[];
  return {
    ready: !results.error,
    results: (results.data ?? []) as FinderResult[],
    items: (items.data ?? []) as FinderItem[],
    balance: balanceOf(rows),
    held: heldOf(rows),
    reported: new Map(
      ((reports.data ?? []) as { result_id: string; status: string }[]).map((r) => [r.result_id, r.status])
    ),
  };
}
