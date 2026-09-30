"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { planLimitFromError } from "@/lib/plan-limits";
import { AUP_VERSION, areaCountry, betaCredits, isFinderBeta, finderErrorKey, finderErrorMessage, parseIntake } from "@/lib/finder";
import { parseSmartSearch } from "@/lib/finder-query";
import { DISCOVER_DEFAULT_COUNT, LOCKED_SEARCHES_PER_DAY } from "@/lib/finder-plans";
import { industryLabel } from "@/lib/finder";
import { getFinderAccess, getSpendAccess, loadProfile, unlockPaid } from "@/lib/finder-server";
import { runFairChecks } from "@/lib/fair-credit-server";

// Lead Finder actions. Every one starts from the user's own session
// (requireUserAndBusiness). Reads and owner actions go through RLS and the
// SECURITY DEFINER functions in 0019/0020 (they check the owner again). Only
// the search itself uses the service role, because it may also read the
// shared knowledge base, and only after the access check here.

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type FinderFormState = { error?: string; success?: string; upgrade?: boolean; locked?: boolean };

const CLOSED = "The Lead Finder isn't open yet. It's coming soon.";

export async function saveIntake(_prev: FinderFormState, formData: FormData): Promise<FinderFormState> {
  const parsed = parseIntake(formData);
  if (!parsed.ok) return { error: parsed.error };

  const { supabase, business } = await requireUserAndBusiness();
  if (getFinderAccess(business) === "none") return { error: CLOSED };

  const { profile, ready } = await loadProfile(supabase, business.id);
  if (!ready) return { error: "The Lead Finder isn't switched on yet. Please check back soon." };

  const save = async (value: Record<string, unknown>) =>
    profile
      ? supabase.from("finder_profiles").update(value).eq("id", profile.id).eq("business_id", business.id)
      : supabase.from("finder_profiles").insert({ ...value, business_id: business.id });
  let { error } = await save(parsed.value);
  if (error && /area|industry_other/.test(error.message)) {
    // Before 0020: no `area` / `industry_other` columns yet.
    const { area: _area, industry_other: _other, ...rest } = parsed.value;
    void _area;
    void _other;
    ({ error } = await save(rest));
  }
  if (error) return { error: "Couldn't save. Please try again." };

  revalidatePath("/leads/search");
  return { success: "Saved. Your searches use it from now on." };
}

export async function searchLeads(_prev: FinderFormState, formData: FormData): Promise<FinderFormState> {
  const { supabase, business } = await requireUserAndBusiness();
  // Starter / Hustle with lead credits spend them (unlocked results).
  const { access } = await getSpendAccess(supabase, business);
  if (access === "none") return { error: CLOSED };

  let { profile } = await loadProfile(supabase, business.id);
  const defaultCountry = areaCountry(profile?.area) ?? profile?.country ?? "CA";
  const parsed = parseSmartSearch(formData, defaultCountry);
  if (!parsed.ok) return { error: parsed.error };

  // The intake is optional; the Acceptable Use tick is not. The first search
  // saves a profile that holds only the accepted version (the database sets
  // the time).
  if (!profile || profile.aup_version !== AUP_VERSION) {
    if (String(formData.get("aup") ?? "") !== "yes") {
      return { error: "Please tick the Acceptable Use box first." };
    }
    const { error } = profile
      ? await supabase.from("finder_profiles").update({ aup_version: AUP_VERSION }).eq("id", profile.id).eq("business_id", business.id)
      : await supabase.from("finder_profiles").insert({ business_id: business.id, aup_version: AUP_VERSION });
    if (error) {
      console.error("finder AUP save failed:", error.message);
      return { error: "Couldn't save your Acceptable Use tick. Please try again." };
    }
    ({ profile } = await loadProfile(supabase, business.id));
    if (!profile) return { error: "Couldn't save your Acceptable Use tick. Please try again." };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      error: access === "owner"
        ? "The Lead Finder isn't switched on yet (the service key is missing)."
        : "The Lead Finder isn't ready yet. Please try again later.",
    };
  }

  if (access === "full" && isFinderBeta(business.id, process.env)) {
    await admin.rpc("finder_beta_grant", { p_business: business.id, p_credits: betaCredits(process.env) });
  }

  const s = parsed.value;
  const { data, error } = await admin.rpc("finder_submit", {
    p_business: business.id,
    p_profile: profile.id,
    p_kind: "single",
    p_query: {
      kind: s.kind,
      company: s.company,
      city: s.city,
      website: s.website,
      region: s.region ?? profile.province ?? null,
      country: s.country ?? areaCountry(profile.area) ?? profile.country ?? null,
      email: s.email,
      phone: s.phone,
      person: s.person,
    },
    p_mode: access,
    p_daily_cap: LOCKED_SEARCHES_PER_DAY,
  });
  if (error || !data) {
    const key = finderErrorKey(error?.message);
    if (!key) console.error("finder_submit failed:", error?.message ?? "no data");
    if (key === "locked_cap") return { error: finderErrorMessage(error?.message), upgrade: true };
    if (!key && access === "owner" && /finder_submit/.test(error?.message ?? "")) {
      return { error: "Run migration 0020 in Supabase first." };
    }
    return { error: finderErrorMessage(error?.message) };
  }

  const out = data as { status?: string; locked?: boolean };
  // Fair credits: a paid result whose email fails the free check gets its
  // credit back straight away (researched ones are checked on the next page load).
  if (out.status === "found" && access === "full") {
    await runFairChecks(business.id).catch((err) =>
      console.error("fair credit check failed:", err instanceof Error ? err.message : err)
    );
  }
  revalidatePath("/leads/search");
  const lockedNote = out.locked ? " Get lead credits to see the phone, email and website." : "";
  if (out.status === "found") return { success: `Found in our records. It's at the top of the list.${lockedNote}`, locked: !!out.locked };
  if (out.status === "pick") return { success: "We know a few with that name. Pick the right one below (free)." };
  return { success: "Queued. We're researching it now: usually within 1 hour, at most 24 hours." };
}

// "Find me customers": Zilla finds new businesses that match the saved
// intake (industries + area + radius) and researches each one.
export async function findCustomers(_prev: FinderFormState, _formData: FormData): Promise<FinderFormState> {
  void _formData;
  const { supabase, business } = await requireUserAndBusiness();
  const { access } = await getSpendAccess(supabase, business);
  if (access === "none") return { error: CLOSED };
  const { profile } = await loadProfile(supabase, business.id);
  if (!profile?.my_business || !profile.offer) {
    return { error: "Fill in \"What are you hunting?\" first, so we know who to look for." };
  }
  const admin = createAdminClient();
  if (!admin) return { error: "The Lead Finder isn't ready yet. Please try again later." };
  const kinds = [...(profile.industries ?? []).map(industryLabel), ...(profile.industry_other ? [profile.industry_other] : [])];
  const label = `Find me customers: ${kinds.slice(0, 3).join(", ")}${kinds.length > 3 ? ` +${kinds.length - 3}` : ""}`;
  const { data, error } = await admin.rpc("finder_discover_submit", {
    p_business: business.id,
    p_profile: profile.id,
    p_mode: access,
    p_want: DISCOVER_DEFAULT_COUNT,
    p_daily_cap: LOCKED_SEARCHES_PER_DAY,
    p_label: label.slice(0, 200),
  });
  if (error || !data) {
    const key = finderErrorKey(error?.message);
    if (!key) console.error("finder_discover_submit failed:", error?.message ?? "no data");
    if (key === "no_profile") return { error: "Fill in \"What are you hunting?\" first, so we know who to look for." };
    return { error: finderErrorMessage(error?.message), upgrade: key === "locked_cap" };
  }
  revalidatePath("/leads/search");
  return {
    success: `On it. We're looking for up to ${DISCOVER_DEFAULT_COUNT} new companies that match what you're hunting. They show up under In progress, then Results.`,
  };
}

export async function pickCandidate(formData: FormData) {
  const item = String(formData.get("item_id") ?? "");
  const choice = Number(formData.get("choice"));
  if (!UUID_RE.test(item) || !Number.isInteger(choice)) return;
  const { supabase } = await requireUserAndBusiness();
  const { error } = await supabase.rpc("finder_pick", { p_item: item, p_choice: choice });
  if (error && !finderErrorKey(error.message)) console.error("finder_pick failed:", error.message);
  revalidatePath("/leads/search");
}

export async function addFoundToLeads(_prev: FinderFormState, formData: FormData): Promise<FinderFormState> {
  const id = String(formData.get("result_id") ?? "");
  if (!UUID_RE.test(id)) return { error: "That result wasn't found." };
  const { supabase, business } = await requireUserAndBusiness();
  const { error } = await supabase.rpc("finder_add_to_lead", { p_result: id });
  if (error) {
    return planLimitFromError(error, business) ?? { error: finderErrorMessage(error.message) };
  }
  revalidatePath("/leads/search");
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
  revalidatePath("/leads/search");
  const status = (data as { status?: string } | null)?.status;
  if (status === "refunded") return { success: "Thanks. Your credit is back, and we've flagged that contact." };
  if (status === "review") return { success: "Thanks. We'll look at it and refund the credit if it's wrong." };
  return { success: "Thanks. We've flagged that contact." };
}

// Unlock one saved locked result. Boss / owner: free. Starter / Hustle:
// 1 lead credit (finder_unlock_paid, 0021).
export async function unlockResult(_prev: FinderFormState, formData: FormData): Promise<FinderFormState> {
  const id = String(formData.get("result_id") ?? "");
  if (!UUID_RE.test(id)) return { error: "That result wasn't found." };
  const { business } = await requireUserAndBusiness();
  if (getFinderAccess(business) === "none") return { error: CLOSED };
  const out = await unlockPaid(business.id, id);
  if (!out.ok) {
    const key = finderErrorKey(out.error);
    if (!key) {
      console.error("finder_unlock_paid failed:", out.error);
      if (/finder_unlock_paid/.test(out.error ?? "")) return { error: "Unlocking isn't switched on yet. Please try again later." };
    }
    return { error: finderErrorMessage(out.error), upgrade: key === "no_credits" };
  }
  revalidatePath("/leads/search");
  return { success: out.credits ? "Unlocked for 1 lead credit." : "Unlocked." };
}
