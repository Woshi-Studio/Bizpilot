// Plan limits on the server. SERVER ONLY.
//
// The hard wall is in the database (0017_plans_limits.sql): triggers
// refuse the insert for any request made with a user's session. This file
//   - checks first, so the user gets a friendly message with an Upgrade
//     button instead of a database error,
//   - checks for the agent API, which uses the service role (the
//     triggers let the service role through),
//   - turns "plan_limit:..." database errors into the same message,
//   - reads usage for the meter in Settings -> Plan.
//
// The owner's businesses (OWNER_BUSINESS_IDS) are never limited.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerBusiness } from "@/lib/ai-quota";
import { isDemoMode } from "@/lib/demo";
import {
  PLAN_LIMITS,
  limitMessage,
  nextPlan,
  normalizePlanValue,
  parsePlanLimitError,
  type LimitKind,
  type Plan,
} from "@/lib/plans";

export type PlanUsage = Record<LimitKind, number>;

export type PlanState = {
  plan: Plan;
  unlimited: boolean;
  limits: Record<LimitKind, number | null>;
  usage: PlanUsage | null;
  // false = migration 0017 isn't run; usage was counted in the app and
  // receipts aren't included in storage.
  fromDb: boolean;
};

// What a server action returns when a limit stops it.
export type LimitBlock = { error: string; upgrade: boolean };

type Biz = { id: string; plan?: string | null };

const LINE_TABLES = ["customers", "leads", "services", "tasks", "invoices"] as const;

function blockFor(kind: LimitKind, plan: Plan): LimitBlock {
  return { error: limitMessage(kind, plan), upgrade: nextPlan(plan) !== null };
}

// Turns a "plan_limit:..." database error into the friendly message.
export function planLimitFromError(
  error: { message?: string } | null | undefined,
  business: Biz
): LimitBlock | null {
  const kind = parsePlanLimitError(error?.message);
  if (!kind) return null;
  if (kind === "convert") {
    return {
      error: "To mark a lead as converted, open it and press “Add to customers”.",
      upgrade: false,
    };
  }
  return blockFor(kind, normalizePlanValue(business.plan));
}

async function countRows(q: PromiseLike<{ count: number | null; error: unknown }>) {
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

// Distinct business lines in use, lower-cased.
async function linesInUse(db: SupabaseClient, businessId: string): Promise<Set<string>> {
  const results = await Promise.all(
    LINE_TABLES.map((t) =>
      db
        .from(t)
        .select("business_line")
        .eq("business_id", businessId)
        .not("business_line", "is", null)
        .limit(5000)
    )
  );
  const set = new Set<string>();
  for (const r of results) {
    for (const row of (r.data ?? []) as { business_line: string | null }[]) {
      if (row.business_line) set.add(row.business_line.toLowerCase());
    }
  }
  return set;
}

// Counted in the app (before 0017, or if the RPC fails).
async function usageFromTables(db: SupabaseClient, businessId: string): Promise<PlanUsage> {
  const since = new Date(Date.now() - 28 * 86_400_000).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const [customers, openLeads, docs, files, email, lines] = await Promise.all([
    countRows(
      db.from("customers").select("id", { count: "exact", head: true }).eq("business_id", businessId)
    ),
    countRows(
      db
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .neq("status", "converted")
    ),
    countRows(
      db
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .gte("created_at", since)
    ),
    db.from("documents").select("size").eq("business_id", businessId).limit(10000),
    db.from("email_usage").select("count").eq("business_id", businessId).eq("day", today).maybeSingle(),
    linesInUse(db, businessId),
  ]);
  const storage = ((files.data ?? []) as { size: number | null }[]).reduce(
    (sum, f) => sum + Number(f.size ?? 0),
    0
  );
  return {
    contacts: customers + openLeads,
    docs,
    storage,
    email: Number((email.data as { count?: number } | null)?.count ?? 0),
    lines: lines.size,
  };
}

export async function getPlanUsage(
  db: SupabaseClient,
  businessId: string
): Promise<{ usage: PlanUsage | null; fromDb: boolean }> {
  const { data, error } = await db.rpc("plan_usage", { p_business: businessId });
  if (!error && data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    return {
      fromDb: true,
      usage: {
        contacts: Number(d.contacts ?? 0),
        docs: Number(d.docs_28d ?? 0),
        storage: Number(d.storage_bytes ?? 0),
        email: Number(d.email_today ?? 0),
        lines: Number(d.business_lines ?? 0),
      },
    };
  }
  try {
    return { usage: await usageFromTables(db, businessId), fromDb: false };
  } catch (err) {
    console.error("plan usage count failed:", err instanceof Error ? err.message : err);
    return { usage: null, fromDb: false };
  }
}

export async function getPlanState(db: SupabaseClient, business: Biz): Promise<PlanState> {
  const plan = normalizePlanValue(business.plan);
  const unlimited = isOwnerBusiness(business.id);
  const limits = unlimited
    ? { contacts: null, docs: null, storage: null, email: null, lines: null }
    : PLAN_LIMITS[plan];
  const { usage, fromDb } = await getPlanUsage(db, business.id);
  return { plan, unlimited, limits, usage, fromDb };
}

// Checks one limit before a create. null = go ahead.
//   line:  for "lines", the business line about to be saved
//   bytes: for "storage", the size of the file about to be uploaded
// Fails OPEN on a read error: the database triggers are the real wall.
export async function checkPlanLimit(
  db: SupabaseClient,
  business: Biz,
  kind: LimitKind,
  opts: { line?: string | null; bytes?: number } = {}
): Promise<LimitBlock | null> {
  if (isOwnerBusiness(business.id)) return null;
  const plan = normalizePlanValue(business.plan);
  const limit = PLAN_LIMITS[plan][kind];
  if (limit === null) return null;
  if (kind === "email" && limit <= 0) return blockFor(kind, plan);

  try {
    if (kind === "lines") {
      const line = opts.line?.trim().toLowerCase();
      if (!line) return null;
      const lines = await linesInUse(db, business.id);
      if (lines.has(line)) return null;
      return lines.size >= limit ? blockFor(kind, plan) : null;
    }

    const { usage } = await getPlanUsage(db, business.id);
    if (!usage) return null;
    const used = usage[kind];
    if (kind === "storage") {
      return used + (opts.bytes ?? 0) > limit ? blockFor(kind, plan) : null;
    }
    return used >= limit ? blockFor(kind, plan) : null;
  } catch (err) {
    console.error(`plan check (${kind}) failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// Checks several business lines at once (e.g. a form that sets one).
export async function checkLineLimit(db: SupabaseClient, business: Biz, line: string | null) {
  return line ? checkPlanLimit(db, business, "lines", { line }) : null;
}

// The database needs to know which businesses are the owner's, so the
// triggers skip them. Copies OWNER_BUSINESS_IDS into
// plan_unlimited_businesses (service role). Once per server process.
const synced = new Set<string>();
export async function ensureUnlimitedFlag(businessId: string) {
  if (synced.has(businessId) || isDemoMode() || !isOwnerBusiness(businessId)) return;
  const admin = createAdminClient();
  if (!admin) return;
  const { error } = await admin
    .from("plan_unlimited_businesses")
    .upsert({ business_id: businessId }, { onConflict: "business_id", ignoreDuplicates: true });
  if (!error) synced.add(businessId);
  else if (!/does not exist|schema cache/i.test(error.message)) {
    console.error("could not mark the owner's business unlimited:", error.message);
  }
}

// Plan-gated features (not counts).
export function canUseAssistant(business: Biz) {
  return isOwnerBusiness(business.id) || normalizePlanValue(business.plan) !== "free";
}
