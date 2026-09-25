import type { SupabaseClient } from "@supabase/supabase-js";
import type { Business } from "@/lib/types";

// DAILY AI credits per business, reset at midnight UTC.
// The real cap is enforced in the database by consume_ai_credit()
// (supabase/migrations/0012_daily_ai_credits.sql) — keep these numbers
// in sync with that file. These are only used for display and fallbacks.
export const AI_DAILY_CREDITS: Record<string, number> = {
  free: 25,
  premium: 200,
};

// Kept for anything that still imports the old name.
export const AI_LIMITS = AI_DAILY_CREDITS;

export const AI_RESET_TEXT = "resets at midnight UTC";

export function planOf(business: Business & { plan?: string }) {
  return business.plan === "premium" ? "premium" : "free";
}

// The owner's own businesses (OWNER_BUSINESS_IDS, comma-separated
// business ids, server-only env) are never counted.
export function isOwnerBusiness(businessId: string) {
  return (process.env.OWNER_BUSINESS_IDS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(businessId.toLowerCase());
}

// Today's key in ai_usage.month. Must match to_char(..., 'YYYY-MM-DD')
// in consume_ai_credit().
export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export type AiCredit = {
  ok: boolean;
  used: number;
  limit: number;
  unlimited?: boolean;
};

// Uses one AI credit for this business today, atomically, in the
// database. Call it BEFORE the AI request.
// Fails CLOSED: any error (function missing, not the owner, network)
// means no AI call.
export async function consumeAiCredit(
  supabase: SupabaseClient,
  business: Business & { plan?: string }
): Promise<AiCredit> {
  const fallbackLimit = AI_DAILY_CREDITS[planOf(business)];

  if (isOwnerBusiness(business.id)) {
    return { ok: true, used: 0, limit: fallbackLimit, unlimited: true };
  }

  const { data, error } = await supabase.rpc("consume_ai_credit", {
    p_business: business.id,
  });

  if (error || !data || typeof data !== "object") {
    console.error(
      "consume_ai_credit failed (is migration 0012 applied?):",
      error?.message ?? "no data"
    );
    return { ok: false, used: 0, limit: fallbackLimit };
  }

  const result = data as { allowed?: unknown; used?: unknown; limit?: unknown };
  return {
    ok: result.allowed === true,
    used: Number(result.used ?? 0),
    limit: Number(result.limit ?? fallbackLimit),
  };
}

// Read-only: today's usage for the credit meter. Uses the owner's
// SELECT permission on ai_usage (0011). Returns null if it can't read.
export async function getAiCredits(
  supabase: SupabaseClient,
  business: Business & { plan?: string }
): Promise<AiCredit | null> {
  const limit = AI_DAILY_CREDITS[planOf(business)];

  if (isOwnerBusiness(business.id)) {
    return { ok: true, used: 0, limit, unlimited: true };
  }

  const { data, error } = await supabase
    .from("ai_usage")
    .select("count")
    .eq("business_id", business.id)
    .eq("month", todayKey())
    .maybeSingle();

  if (error) {
    console.error("reading ai_usage failed:", error.message);
    return null;
  }

  const used = Math.min(Number(data?.count ?? 0), limit);
  return { ok: used < limit, used, limit };
}

// "AI credits today: 7 of 25 · resets at midnight UTC"
export function creditMeterText(credit: AiCredit) {
  if (credit.unlimited) return "AI credits today: unlimited (owner)";
  return `AI credits today: ${credit.used} of ${credit.limit} · ${AI_RESET_TEXT}`;
}

// The message to show when consumeAiCredit() says no.
export function aiCreditError(credit: AiCredit) {
  if (credit.used >= credit.limit) {
    return `You've used all of today's AI credits. ${creditMeterText(credit)}.`;
  }
  return "AI is taking a short break. Please try again in a few minutes.";
}
