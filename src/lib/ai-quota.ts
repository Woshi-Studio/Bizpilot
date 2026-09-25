import type { SupabaseClient } from "@supabase/supabase-js";
import type { Business } from "@/lib/types";

// Shown in the UI. The real cap is enforced in the database by
// consume_ai_credit() (supabase/migrations/0011_security.sql) — keep the
// numbers in sync.
export const AI_LIMITS: Record<string, number> = {
  free: 10,
  premium: 300,
};

export function planOf(business: Business & { plan?: string }) {
  return business.plan === "premium" ? "premium" : "free";
}

export type AiCredit = { ok: boolean; used: number; limit: number };

// Uses one AI credit for this business this month, atomically, in the
// database. Call it BEFORE the AI request.
// Fails CLOSED: any error (function missing, not the owner, network)
// means no AI call.
export async function consumeAiCredit(
  supabase: SupabaseClient,
  business: Business & { plan?: string }
): Promise<AiCredit> {
  const fallbackLimit = AI_LIMITS[planOf(business)];

  const { data, error } = await supabase.rpc("consume_ai_credit", {
    p_business: business.id,
  });

  if (error || !data || typeof data !== "object") {
    console.error(
      "consume_ai_credit failed (is migration 0011 applied?):",
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

// The message to show when consumeAiCredit() says no.
export function aiCreditError(credit: AiCredit, what = "AI generations") {
  if (credit.used >= credit.limit) {
    return `You've used all ${credit.limit} ${what} included this month. Your counter resets on the 1st.`;
  }
  return "AI is unavailable right now — please try again later.";
}
