import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Business } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

// True when row `id` in `table` belongs to `businessId`. Use it before
// saving a customer_id / service_id / task_id sent from a form, so a
// record can't point at another business's data.
export async function belongsToBusiness(
  supabase: SupabaseClient,
  table: "customers" | "services" | "tasks" | "leads",
  id: string,
  businessId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  return !error && !!data;
}

// Resolves the logged-in user and their onboarded business, redirecting
// away when either is missing. Use at the top of protected pages/actions.
export async function requireUserAndBusiness() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .eq("onboarding_completed", true)
    // Oldest first, one row: an account that somehow has two businesses
    // still resolves instead of looping back to onboarding.
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!business) {
    redirect("/onboarding");
  }

  return { supabase, user, business: business as Business };
}

// Columns added by migration 0015 (contact address / website, lead
// company). Until 0015 is run they don't exist, so a save that includes
// them fails with "column not found". Use this to retry without them.
export const CONTACT_EXTRA_FIELDS = ["address", "website", "company"] as const;

export function isMissingColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* (does not exist|not find)|could not find the .* column/i.test(error.message ?? "")
  );
}

// Reads an optional short text field; "" -> null.
export function optionalText(formData: FormData, key: string, max: number) {
  const v = String(formData.get(key) ?? "").trim().slice(0, max);
  return v || null;
}

// Websites are stored as typed; shown as a link only if they look like one.
export function websiteHref(value: string | null | undefined) {
  if (!value) return null;
  const v = value.trim();
  if (/^https?:\/\/[^\s]+$/i.test(v)) return v;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/[^\s]*)?$/i.test(v)) return `https://${v}`;
  return null;
}
