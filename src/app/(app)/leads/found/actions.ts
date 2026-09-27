"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { planLimitFromError } from "@/lib/plan-limits";
import { betaCredits, finderErrorKey, finderErrorMessage, parseIntake, parseSearch } from "@/lib/finder";
import { getFinderAccess, loadProfile } from "@/lib/finder-server";

// Lead Finder actions. Every one starts from the user's own session
// (requireUserAndBusiness). Reads and owner actions go through RLS and the
// SECURITY DEFINER functions in 0019 (they check the owner again). Only
// the search itself uses the service role, because it may also read the
// shared knowledge base, and only after the invite list is checked here.

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type FinderFormState = { error?: string; success?: string; upgrade?: boolean };

const CLOSED = "The Lead Finder is invite-only while we test it.";

export async function saveIntake(_prev: FinderFormState, formData: FormData): Promise<FinderFormState> {
  const parsed = parseIntake(formData);
  if (!parsed.ok) return { error: parsed.error };

  const { supabase, business } = await requireUserAndBusiness();
  if (getFinderAccess(business.id) === "none") return { error: CLOSED };

  const { profile, ready } = await loadProfile(supabase, business.id);
  if (!ready) return { error: "The Lead Finder isn't switched on yet. Please check back soon." };

  const { error } = profile
    ? await supabase.from("finder_profiles").update(parsed.value).eq("id", profile.id).eq("business_id", business.id)
    : await supabase.from("finder_profiles").insert({ ...parsed.value, business_id: business.id });
  if (error) return { error: "Couldn't save. Please try again." };

  revalidatePath("/leads/found");
  return { success: "Saved. You can search now." };
}

export async function searchCompany(_prev: FinderFormState, formData: FormData): Promise<FinderFormState> {
  const parsed = parseSearch(formData);
  if (!parsed.ok) return { error: parsed.error };

  const { supabase, business } = await requireUserAndBusiness();
  const access = getFinderAccess(business.id);
  if (access === "none") return { error: CLOSED };

  const { profile } = await loadProfile(supabase, business.id);
  if (!profile) return { error: finderErrorMessage("finder:no_profile") };

  const admin = createAdminClient();
  if (!admin) {
    return {
      error: access === "owner"
        ? "The Lead Finder isn't switched on yet (the service key is missing)."
        : "The Lead Finder isn't ready yet. Please try again later.",
    };
  }

  if (access === "beta") {
    await admin.rpc("finder_beta_grant", { p_business: business.id, p_credits: betaCredits(process.env) });
  }

  const s = parsed.value;
  const { data, error } = await admin.rpc("finder_submit", {
    p_business: business.id,
    p_profile: profile.id,
    p_kind: "single",
    p_company: s.company,
    p_city: s.city,
    p_website: s.website,
    p_region: s.region,
    p_country: s.country ?? profile.country,
    p_unlimited: access === "owner",
  });
  if (error || !data) {
    const key = finderErrorKey(error?.message);
    if (!key) console.error("finder_submit failed:", error?.message ?? "no data");
    return { error: finderErrorMessage(error?.message) };
  }

  revalidatePath("/leads/found");
  const status = (data as { status?: string }).status;
  if (status === "found") return { success: `Found in our records. It's at the top of the list.` };
  if (status === "pick") return { success: "We know a few with that name. Pick the right one below (free)." };
  return { success: "Queued. We're researching it now: usually within 1 hour, at most 24 hours." };
}

export async function pickCandidate(formData: FormData) {
  const item = String(formData.get("item_id") ?? "");
  const choice = Number(formData.get("choice"));
  if (!UUID_RE.test(item) || !Number.isInteger(choice)) return;
  const { supabase } = await requireUserAndBusiness();
  const { error } = await supabase.rpc("finder_pick", { p_item: item, p_choice: choice });
  if (error && !finderErrorKey(error.message)) console.error("finder_pick failed:", error.message);
  revalidatePath("/leads/found");
}

export async function addFoundToLeads(_prev: FinderFormState, formData: FormData): Promise<FinderFormState> {
  const id = String(formData.get("result_id") ?? "");
  if (!UUID_RE.test(id)) return { error: "That result wasn't found." };
  const { supabase, business } = await requireUserAndBusiness();
  const { error } = await supabase.rpc("finder_add_to_lead", { p_result: id });
  if (error) {
    return planLimitFromError(error, business) ?? { error: finderErrorMessage(error.message) };
  }
  revalidatePath("/leads/found");
  revalidatePath("/leads");
  return { success: "Added to your leads." };
}

export async function reportFound(_prev: FinderFormState, formData: FormData): Promise<FinderFormState> {
  const id = String(formData.get("result_id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 500);
  if (!UUID_RE.test(id) || !["bounce", "wrong_number", "other"].includes(kind)) {
    return { error: "Pick what went wrong." };
  }
  const { supabase } = await requireUserAndBusiness();
  const { data, error } = await supabase.rpc("finder_report_bounce", { p_result: id, p_kind: kind, p_note: note });
  if (error) return { error: finderErrorMessage(error.message) };
  revalidatePath("/leads/found");
  const status = (data as { status?: string } | null)?.status;
  if (status === "refunded") return { success: "Thanks. Your credit is back, and we've flagged that contact." };
  if (status === "review") return { success: "Thanks. We'll look at it and refund the credit if it's wrong." };
  return { success: "Thanks. We've flagged that contact." };
}
