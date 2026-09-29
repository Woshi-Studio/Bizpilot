// Lead alerts on the server. SERVER ONLY. See src/lib/lead-alerts.ts.

import { createHmac } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverEmail, isValidEmail, platformEmailProvider } from "@/lib/email";
import { finderAccess } from "@/lib/finder";
import { getFinderAccess } from "@/lib/finder-server";
import { siteUrl } from "@/lib/stripe";
import {
  alertMode,
  buildDigest,
  digestDue,
  digestSince,
  modeAfterUnsubscribe,
  seenSince,
  unsubToken,
  unsubValid,
  wantsApp,
  wantsEmail,
  type DigestResult,
  type LeadAlertMode,
} from "@/lib/lead-alerts";

// The unsubscribe links are signed with a key derived from the service key
// (server only), so no new secret is needed.
function unsubSecret(): string {
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  return key ? createHmac("sha256", key).update("jephelen lead alerts v1").digest("hex") : "";
}

export function unsubscribeUrl(userId: string): string | null {
  const secret = unsubSecret();
  if (!secret) return null;
  return `${siteUrl()}/api/lead-alerts/unsubscribe?u=${userId}&t=${unsubToken(userId, secret)}`;
}

export function checkUnsubscribe(userId: string, token: string): boolean {
  return unsubValid(userId, token, unsubSecret());
}

// The bell: how many results arrived since the user last looked. null =
// no bell (alerts off / email only, or no Lead Finder).
export async function unseenLeadCount(
  supabase: SupabaseClient,
  user: User,
  business: { id: string; plan?: string | null }
): Promise<number | null> {
  if (getFinderAccess(business) === "none") return null;
  if (!wantsApp(alertMode(user.user_metadata))) return null;
  const { count, error } = await supabase
    .from("finder_results")
    .select("id", { count: "exact", head: true })
    .eq("business_id", business.id)
    .gt("created_at", seenSince(user.user_metadata));
  return error ? null : count ?? 0;
}

// Opening Search leads clears the bell. Server-side write (no cookies).
export async function markLeadsSeen(user: User): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...(user.user_metadata ?? {}), lead_alerts_seen_at: new Date().toISOString() },
  });
  if (error) console.error("[lead alerts] mark seen failed:", error.message);
}

// The unsubscribe link: email off (the bell stays unless it was email only).
export async function unsubscribeUser(userId: string): Promise<LeadAlertMode | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  const next = modeAfterUnsubscribe(alertMode(data.user.user_metadata));
  const { error: upErr } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { ...(data.user.user_metadata ?? {}), lead_alerts: next },
  });
  return upErr ? null : next;
}

// The daily digest (cron). At most one email per business a day; the
// audit row is written BEFORE sending, so a second run can't send twice.
export async function runLeadAlertDigests(now = Date.now()) {
  const out = { businesses: 0, sent: 0, skipped: 0, failed: 0, note: "" };
  const admin = createAdminClient();
  if (!admin) return { ...out, note: "service key missing" };
  const provider = platformEmailProvider();
  if (!provider) return { ...out, note: "email sending is not set up (EMAIL_PROVIDER); in-app alerts only" };

  const { data, error } = await admin
    .from("finder_results")
    .select("business_id, company_name, city, region, created_at")
    .gte("created_at", new Date(now - 26 * 3_600_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) return { ...out, note: "could not read results" };

  const byBiz = new Map<string, (DigestResult & { created_at: string })[]>();
  for (const r of (data ?? []) as (DigestResult & { business_id: string; created_at: string })[]) {
    byBiz.set(r.business_id, [...(byBiz.get(r.business_id) ?? []), r]);
  }

  for (const [businessId, rows] of [...byBiz.entries()].slice(0, 200)) {
    out.businesses++;
    try {
      const { data: biz } = await admin.from("businesses").select("id, name, owner_id, plan").eq("id", businessId).maybeSingle();
      const b = biz as { id: string; name: string; owner_id: string | null; plan: string | null } | null;
      if (!b?.owner_id || finderAccess(b.id, process.env, b.plan) === "none") {
        out.skipped++;
        continue;
      }
      const { data: u } = await admin.auth.admin.getUserById(b.owner_id);
      const user = u?.user;
      const mode = alertMode(user?.user_metadata);
      if (!user || !wantsEmail(mode) || !isValidEmail(user.email)) {
        out.skipped++;
        continue;
      }
      const { data: last } = await admin
        .from("finder_audit")
        .select("created_at")
        .eq("business_id", b.id)
        .eq("action", "lead_alert_email")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastAt = (last as { created_at?: string } | null)?.created_at ?? null;
      if (!digestDue(lastAt, now)) {
        out.skipped++;
        continue;
      }
      const seenAt = typeof user.user_metadata?.lead_alerts_seen_at === "string" ? user.user_metadata.lead_alerts_seen_at : null;
      const since = Date.parse(digestSince(lastAt, seenAt, now));
      const fresh = rows.filter((r) => Date.parse(r.created_at) > since);
      const unsub = unsubscribeUrl(user.id);
      if (!fresh.length || !unsub) {
        out.skipped++;
        continue;
      }
      const { error: claimErr } = await admin.from("finder_audit").insert({
        business_id: b.id,
        actor: "system",
        action: "lead_alert_email",
        detail: { count: fresh.length },
      });
      if (claimErr) {
        out.failed++;
        continue;
      }
      const mail = buildDigest({ businessName: b.name, results: fresh, siteUrl: siteUrl(), unsubscribeUrl: unsub });
      await deliverEmail({ provider, to: user.email!, subject: mail.subject, text: mail.text, fromName: "Jephelen", replyTo: null });
      out.sent++;
    } catch (err) {
      out.failed++;
      console.error("[lead alerts] digest failed:", err instanceof Error ? err.message : "error");
    }
  }
  return out;
}
