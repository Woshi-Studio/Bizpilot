import type { SupabaseClient } from "@supabase/supabase-js";
import type { Business } from "@/lib/types";

export const AI_LIMITS: Record<string, number> = {
  free: 10,
  premium: 300,
};

export function planOf(business: Business & { plan?: string }) {
  return business.plan === "premium" ? "premium" : "free";
}

// Checks whether this business has AI generations left this month.
// Fails OPEN if the ai_usage table doesn't exist yet (migration not run),
// so the app keeps working before the user pastes the SQL.
export async function checkAiQuota(
  supabase: SupabaseClient,
  business: Business & { plan?: string }
): Promise<{ ok: boolean; used: number; limit: number }> {
  const plan = planOf(business);
  const limit = AI_LIMITS[plan];
  const month = new Date().toISOString().slice(0, 7);

  const { data, error } = await supabase
    .from("ai_usage")
    .select("count")
    .eq("business_id", business.id)
    .eq("month", month)
    .maybeSingle();

  if (error) {
    console.warn("ai_usage check failed (migration not run yet?):", error.message);
    return { ok: true, used: 0, limit };
  }

  const used = data?.count ?? 0;
  return { ok: used < limit, used, limit };
}

// Records one successful AI generation for this month.
export async function recordAiUse(
  supabase: SupabaseClient,
  businessId: string
) {
  const month = new Date().toISOString().slice(0, 7);

  const { data } = await supabase
    .from("ai_usage")
    .select("id, count")
    .eq("business_id", businessId)
    .eq("month", month)
    .maybeSingle();

  if (data) {
    await supabase
      .from("ai_usage")
      .update({ count: data.count + 1 })
      .eq("id", data.id);
  } else {
    await supabase
      .from("ai_usage")
      .insert({ business_id: businessId, month, count: 1 });
  }
}
