// Fair credits on the server. SERVER ONLY. See src/lib/fair-credit.ts.
//
// Runs for one business whose session the caller already checked. Uses
// the service role (the ledger, reports and audit are read-only for users).
// Idempotent: the refund is tied to a finder_bounce_reports row, and that
// table allows ONE row per result (unique), so two page loads at once can
// never refund twice, and a user report after an automatic refund gets
// "already reported" from finder_report_bounce.

import { Resolver } from "node:dns/promises";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkEmail, emailDomainIfValid, fairReasonText, needsFairCheck, type FairVerdict } from "@/lib/fair-credit";

const MAX_PER_RUN = 10;

export async function runFairChecks(businessId: string): Promise<{ checked: number; refunded: number }> {
  const done = { checked: 0, refunded: 0 };
  const admin = createAdminClient();
  if (!admin) return done;

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: results, error } = await admin
    .from("finder_results")
    .select("id, email, email_checks, locked, created_at, job_id, item_id, kb_company_id")
    .eq("business_id", businessId)
    .eq("locked", false)
    .not("email", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !results?.length) return done;

  type Row = {
    id: string;
    email: string | null;
    email_checks: Record<string, unknown> | null;
    locked: boolean;
    created_at: string;
    job_id: string | null;
    item_id: string | null;
    kb_company_id: string | null;
  };
  const rows = results as Row[];
  const unchecked = rows.filter((r) => {
    const f = (r.email_checks ?? {})["fair"];
    return f !== "ok" && f !== "bad";
  });
  if (!unchecked.length) return done;
  const ids = unchecked.map((r) => r.id);

  const [spends, reports] = await Promise.all([
    admin
      .from("finder_credit_ledger")
      .select("result_id")
      .eq("business_id", businessId)
      .eq("reason", "spend")
      .in("result_id", ids),
    admin.from("finder_bounce_reports").select("result_id").eq("business_id", businessId).in("result_id", ids),
  ]);
  if (spends.error || reports.error) return done;
  const charged = new Set((spends.data ?? []).map((r) => r.result_id as string));
  const reported = new Set((reports.data ?? []).map((r) => r.result_id as string));

  const todo = unchecked.filter((r) => needsFairCheck(r, charged, reported)).slice(0, MAX_PER_RUN);
  if (!todo.length) return done;

  const resolver = new Resolver({ timeout: 2500, tries: 2 });
  const byDomain = new Map<string, Promise<FairVerdict>>();
  const verdictFor = (email: string | null) => {
    const d = emailDomainIfValid(email) ?? `bad:${email}`;
    if (!byDomain.has(d)) byDomain.set(d, checkEmail(email, (x) => resolver.resolveMx(x)));
    return byDomain.get(d)!;
  };

  await Promise.all(
    todo.map(async (r) => {
      const v = await verdictFor(r.email);
      if (v.verdict === "unknown") return; // DNS hiccup: try again next time
      done.checked++;
      const at = new Date().toISOString();
      const checks = { ...(r.email_checks ?? {}) };

      if (v.verdict === "ok") {
        await admin
          .from("finder_results")
          .update({ email_checks: { ...checks, fair: "ok", fair_at: at } })
          .eq("id", r.id)
          .eq("business_id", businessId)
          .eq("locked", false);
        return;
      }

      // 1. Claim the result (one report per result). Loses the race -> stop.
      const { error: repErr } = await admin.from("finder_bounce_reports").insert({
        business_id: businessId,
        result_id: r.id,
        kind: "bounce",
        note: `Bad email: credit returned (automatic check: ${fairReasonText(v.reason)})`,
        status: "refunded",
      });
      if (repErr) return;

      // 2. The credit back, logged in the append-only ledger.
      const { error: ledErr } = await admin.from("finder_credit_ledger").insert({
        business_id: businessId,
        delta: 1,
        reason: "refund",
        job_id: r.job_id,
        item_id: r.item_id,
        result_id: r.id,
        note: "bad_email",
      });
      if (ledErr) {
        console.error("fair refund failed:", ledErr.message);
        // Undo the claim so the next load (or the user's own report) can retry.
        await admin.from("finder_bounce_reports").delete().eq("result_id", r.id).eq("business_id", businessId);
        return;
      }
      done.refunded++;

      // 3. The card label, the audit log, and stop serving that email to anyone.
      await Promise.all([
        admin
          .from("finder_results")
          .update({ email_checks: { ...checks, fair: "bad", fair_reason: v.reason, fair_at: at, fair_refunded: true } })
          .eq("id", r.id)
          .eq("business_id", businessId)
          .eq("locked", false),
        admin.from("finder_audit").insert({
          business_id: businessId,
          actor: "system",
          action: "fair_refund",
          detail: { result: r.id, reason: v.reason, domain: emailDomainIfValid(r.email) },
        }),
        retireKbEmail(admin, r.kb_company_id, r.email),
      ]);
    })
  );
  return done;
}

async function retireKbEmail(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  companyId: string | null,
  email: string | null
) {
  if (!companyId || !email) return;
  const valueNorm = email.trim().toLowerCase();
  const { data } = await admin
    .from("kb_contacts")
    .select("id, bad_reports")
    .eq("company_id", companyId)
    .eq("kind", "email")
    .eq("value_norm", valueNorm)
    .maybeSingle();
  // Two reports = no longer served (0019). A dead mail domain is proof enough.
  if (data && (data.bad_reports as number) < 2) {
    await admin.from("kb_contacts").update({ bad_reports: 2 }).eq("id", data.id);
  }
}
