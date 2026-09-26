import { createAdminClient } from "@/lib/supabase/admin";
import { getPepper, hashKey, looksLikeKey } from "@/lib/agent/keys";
import { AGENT_ACTIONS, NotFoundError, PlanLimitError } from "@/lib/agent/actions";
import { canUseAssistant } from "@/lib/plan-limits";
import { InputError, redact, type Input } from "@/lib/agent/validate";

// The agent API: an assistant holding a jph_live_ key can call
// POST /api/agent/<action> with a JSON body. See AGENT-API.md.
//
// Security model:
// - The key is hashed (HMAC with AGENT_KEY_PEPPER) and looked up; revoked
//   keys fail. Only the hash is stored.
// - The key's scopes decide which actions it may call.
// - The service-role client is used (no user session here), so every
//   query in lib/agent/actions.ts is filtered by the key's business_id.
//   Ids from another business answer 404.
// - 60 calls/minute and 1,000/day per key, counted from agent_audit.
// - Every call with a valid key writes one agent_audit row.

const PER_MINUTE = 60;
const PER_DAY = 1000;
const MAX_BODY_BYTES = 20_000;

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  return reply(405, { ok: false, error: "use POST" });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params;

  const pepper = getPepper();
  const db = createAdminClient();
  if (!pepper || !db) {
    return reply(503, { ok: false, error: "agent API is not configured" });
  }

  // 1. Who is calling
  const auth = request.headers.get("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!looksLikeKey(key)) {
    return reply(401, { ok: false, error: "missing or malformed API key" });
  }
  const { data: keyRow, error: keyError } = await db
    .from("api_keys")
    .select("id, business_id, scopes")
    .eq("key_hash", hashKey(key, pepper))
    .is("revoked_at", null)
    .maybeSingle();
  if (keyError) {
    return reply(503, { ok: false, error: "agent API is not ready (run migration 0016)" });
  }
  if (!keyRow) {
    return reply(401, { ok: false, error: "invalid or revoked API key" });
  }
  const keyId = keyRow.id as string;
  const businessId = keyRow.business_id as string;
  const scopes = (keyRow.scopes ?? []) as string[];

  // 2. Read the body (before auditing, so the audit row has the input)
  let input: Input = {};
  let bodyError: string | null = null;
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    bodyError = "request body is too large";
  } else if (text.trim()) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        input = parsed as Input;
      } else {
        bodyError = "body must be a JSON object";
      }
    } catch {
      bodyError = "body is not valid JSON";
    }
  }

  const safeAction = /^[a-z_]{1,60}$/.test(action) ? action : "unknown";
  async function audit(ok: boolean, result: string) {
    await db!.from("agent_audit").insert({
      business_id: businessId,
      key_id: keyId,
      action: safeAction,
      input: bodyError ? null : redact(input),
      result: result.slice(0, 500),
      ok,
    });
  }

  // 3. Rate limit (rows marked rate_limited don't count, so a client
  //    that keeps knocking isn't locked out for the whole day)
  const now = Date.now();
  const countSince = async (ms: number) => {
    const { count } = await db
      .from("agent_audit")
      .select("id", { count: "exact", head: true })
      .eq("key_id", keyId)
      .neq("result", "rate_limited")
      .gte("created_at", new Date(now - ms).toISOString());
    return count ?? 0;
  };
  const [lastMinute, lastDay] = await Promise.all([
    countSince(60_000),
    countSince(86_400_000),
  ]);
  if (lastMinute >= PER_MINUTE || lastDay >= PER_DAY) {
    await audit(false, "rate_limited");
    return reply(429, {
      ok: false,
      error: lastDay >= PER_DAY
        ? `daily limit reached (${PER_DAY} calls a day)`
        : `too many calls (${PER_MINUTE} a minute), slow down`,
    });
  }

  await db
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyId);

  // 4. Action + scope
  const handler = AGENT_ACTIONS[action];
  if (!handler) {
    await audit(false, "unknown action");
    return reply(404, {
      ok: false,
      error: `unknown action; use one of: ${Object.keys(AGENT_ACTIONS).join(", ")}`,
    });
  }
  if (!scopes.includes(handler.scope)) {
    await audit(false, `missing scope ${handler.scope}`);
    return reply(403, { ok: false, error: `this key lacks the ${handler.scope} scope` });
  }
  if (bodyError) {
    await audit(false, bodyError);
    return reply(400, { ok: false, error: bodyError });
  }

  // 5. Plan: assistant access is a Hustle / Boss feature (owner always).
  const { data: biz } = await db
    .from("businesses")
    .select("plan")
    .eq("id", businessId)
    .maybeSingle();
  const plan = (biz as { plan?: string | null } | null)?.plan ?? "free";
  if (!canUseAssistant({ id: businessId, plan })) {
    await audit(false, "plan");
    return reply(403, {
      ok: false,
      error: "assistant access needs the Hustle or Boss plan",
    });
  }

  // 6. Run it
  try {
    const data = await handler.run({ db, businessId, plan }, input);
    await audit(true, "ok");
    return reply(200, { ok: true, data });
  } catch (err) {
    if (err instanceof InputError) {
      await audit(false, err.message);
      return reply(400, { ok: false, error: err.message });
    }
    if (err instanceof PlanLimitError) {
      await audit(false, "plan limit");
      return reply(402, { ok: false, error: err.message, upgrade: true });
    }
    if (err instanceof NotFoundError) {
      await audit(false, err.message);
      return reply(404, { ok: false, error: err.message });
    }
    const msg = err instanceof Error ? err.message : "server error";
    console.error(`[agent] ${safeAction} failed:`, msg);
    await audit(false, msg);
    return reply(500, { ok: false, error: msg });
  }
}
