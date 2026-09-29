// Referrals on the server. SERVER ONLY. See src/lib/referral.ts.

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  REFERRAL_CREDITS,
  REFERRAL_POOL,
  decodeRefCode,
  referralBlocked,
  referralRef,
  refFromMetadata,
  referrerFromAppMetadata,
} from "@/lib/referral";

async function ownerOf(admin: SupabaseClient, businessId: string) {
  const { data } = await admin.from("businesses").select("id, owner_id").eq("id", businessId).maybeSingle();
  const row = data as { id?: string; owner_id?: string | null } | null;
  if (!row?.id || !row.owner_id) return null;
  const { data: u } = await admin.auth.admin.getUserById(row.owner_id);
  return { businessId: row.id, ownerId: row.owner_id, email: u?.user?.email ?? null, user: u?.user ?? null };
}

// Onboarding just created `businessId` for `user`. If they signed up from
// an invite link, pin the referrer on the account (app metadata: server
// write only) once, after the self-referral checks. Never throws.
export async function pinReferrer(user: User, businessId: string): Promise<void> {
  try {
    const code = refFromMetadata(user.user_metadata);
    if (!code || referrerFromAppMetadata(user.app_metadata)) return;
    const referrerId = decodeRefCode(code);
    const admin = createAdminClient();
    if (!referrerId || !admin) return;
    const referrer = await ownerOf(admin, referrerId);
    if (!referrer) return;
    const blocked = referralBlocked({
      referrerBusinessId: referrer.businessId,
      referrerOwnerId: referrer.ownerId,
      referrerEmail: referrer.email,
      referredBusinessId: businessId,
      referredOwnerId: user.id,
      referredEmail: user.email ?? null,
    });
    if (blocked) {
      console.log(`[referral] not counted (${blocked})`);
      return;
    }
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...(user.app_metadata ?? {}), referred_by: referrer.businessId, referred_at: new Date().toISOString() },
    });
    if (error) {
      console.error("[referral] pin failed:", error.message);
      return;
    }
    // "N joined" on the referrer's Settings (users can read their own audit rows).
    await admin.from("finder_audit").insert({
      business_id: referrer.businessId,
      actor: "system",
      action: "referral_signup",
      detail: { referred: businessId },
    });
  } catch (err) {
    console.error("[referral] pin failed:", err instanceof Error ? err.message : err);
  }
}

// A payment by `referredBusinessId` cleared (Stripe webhook). Reward the
// referrer once: finder_grant ignores a reference it has seen, so a retried
// webhook or a second payment adds nothing. Never throws: a referral must
// never make a billing webhook fail.
export async function rewardReferral(admin: SupabaseClient, referredBusinessId: string): Promise<string> {
  try {
    const referred = await ownerOf(admin, referredBusinessId);
    if (!referred?.user) return "no_business";
    const referrerId = referrerFromAppMetadata(referred.user.app_metadata);
    if (!referrerId) return "not_referred";
    const referrer = await ownerOf(admin, referrerId);
    if (!referrer) return "no_referrer";
    const blocked = referralBlocked({
      referrerBusinessId: referrer.businessId,
      referrerOwnerId: referrer.ownerId,
      referrerEmail: referrer.email,
      referredBusinessId: referred.businessId,
      referredOwnerId: referred.ownerId,
      referredEmail: referred.email,
    });
    if (blocked) return blocked;
    const { data, error } = await admin.rpc("finder_grant", {
      p_business: referrer.businessId,
      p_pool: REFERRAL_POOL,
      p_credits: REFERRAL_CREDITS,
      p_ref: referralRef(referred.businessId),
      p_rollover: true,
    });
    if (error) {
      console.error("[referral] grant failed:", error.message);
      return "error";
    }
    const status = (data as { status?: string } | null)?.status ?? "?";
    console.log(`[referral] ${referralRef(referred.businessId)}: ${status}`);
    return status;
  } catch (err) {
    console.error("[referral] reward failed:", err instanceof Error ? err.message : err);
    return "error";
  }
}

// Settings: how many joined from the link, and how many rewards came in.
export async function referralCounts(businessId: string): Promise<{ joined: number; rewarded: number } | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const [joined, rewarded] = await Promise.all([
    admin
      .from("finder_audit")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("action", "referral_signup"),
    admin
      .from("finder_grants")
      .select("ref", { count: "exact", head: true })
      .eq("business_id", businessId)
      .like("ref", "referral:%"),
  ]);
  if (joined.error || rewarded.error) return null;
  return { joined: joined.count ?? 0, rewarded: rewarded.count ?? 0 };
}
