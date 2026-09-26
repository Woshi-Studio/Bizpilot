"use server";

import { requireUserAndBusiness, isMissingColumnError } from "@/lib/data";
import { isOwnerBusiness } from "@/lib/ai-quota";
import { isThemeId, normalizePlanValue, themeAllowed } from "@/lib/plans";

// Saves the theme on the user's profile (migration 0017), so it follows
// them to other devices. null = follow the device (clean / dark).
// Paid themes are refused on Starter; the page also falls back to Clean
// if a Starter somehow has one saved.
export async function saveTheme(theme: string | null): Promise<{ ok: boolean; error?: string }> {
  if (theme !== null && !isThemeId(theme)) return { ok: false, error: "Unknown theme." };

  const { supabase, user, business } = await requireUserAndBusiness();
  const plan = normalizePlanValue(business.plan);
  if (theme && !themeAllowed(theme, plan, isOwnerBusiness(business.id))) {
    return { ok: false, error: "That theme comes with Hustle." };
  }

  const { error } = await supabase.from("profiles").update({ theme }).eq("id", user.id);
  if (error) {
    // Before 0017 there is no column: the choice still lives in this browser.
    if (isMissingColumnError(error)) return { ok: true };
    return { ok: false, error: "Couldn't save your theme." };
  }
  return { ok: true };
}

// The welcome tour was finished or skipped.
export async function markTourDone(): Promise<void> {
  const { supabase, user } = await requireUserAndBusiness();
  const { error } = await supabase
    .from("profiles")
    .update({ tour_done_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error && !isMissingColumnError(error)) {
    console.error("could not save tour_done_at:", error.message);
  }
}

// Where the tour shows the contact action bar: the first customer, else
// the first lead. null = none yet.
export async function firstContactHref(): Promise<string | null> {
  const { supabase, business } = await requireUserAndBusiness();
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("business_id", business.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (customer) return `/customers/${customer.id}`;
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("business_id", business.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return lead ? `/leads/${lead.id}` : null;
}
