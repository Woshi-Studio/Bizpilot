import { createAdminClient } from "@/lib/supabase/admin";
import { getPepper } from "@/lib/agent/keys";
import {
  WorkerInputError,
  bearerKey,
  hashWorkerKey,
  looksLikeWorkerKey,
  parseClaim,
  parseCompletion,
  parseDiscovered,
  parseHeartbeat,
  parseLookup,
} from "@/lib/finder-worker";

// The Lead Finder worker API: Zilla on the owner's PC, holding a
// jph_work_ key, calls POST /api/finder/worker/<action>:
//   claim      {limit?: 1..5}          -> items to research
//   heartbeat  {item_ids: [...]}       -> keeps claimed items (15-min timeout)
//   complete   {item_id, outcome, ...} -> saves what was found, settles credits
//   lookup     {website? | name, city?} -> what the knowledge base already has
//   discovered {item_id, companies[]}  -> "Find me customers": new businesses
//                                         found for a discovery item (0020)
//
// Security model (same pattern as the agent API):
// - Only HMAC(AGENT_KEY_PEPPER, key) is stored; revoked keys fail.
// - The service-role key never leaves the server. Every database write is
//   a SECURITY DEFINER function in 0019 that checks the item belongs to
//   this worker.
// - The worker never sees who asked for a search: items carry the company,
//   city, website and the needs, nothing about the user.
// - 120 calls a minute per worker; every call is written to finder_audit.

const PER_MINUTE = 120;
const MAX_BODY_BYTES = 50_000;

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  return reply(405, { ok: false, error: "use POST" });
}

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;

  const pepper = getPepper();
  const db = createAdminClient();
  if (!pepper || !db) {
    return reply(503, { ok: false, error: "finder worker API is not configured" });
  }

  const key = bearerKey(request.headers.get("authorization"));
  if (!looksLikeWorkerKey(key)) {
    return reply(401, { ok: false, error: "missing or malformed worker key" });
  }
  const { data: worker, error: workerError } = await db
    .from("finder_workers")
    .select("id")
    .eq("key_hash", hashWorkerKey(key, pepper))
    .is("revoked_at", null)
    .maybeSingle();
  if (workerError) {
    return reply(503, { ok: false, error: "finder is not ready (run migration 0019)" });
  }
  if (!worker) {
    return reply(401, { ok: false, error: "invalid or revoked worker key" });
  }
  const workerId = (worker as { id: string }).id;
  const safeAction = /^[a-z_]{1,20}$/.test(action) ? action : "unknown";

  async function audit(ok: boolean, detail: Record<string, unknown>) {
    await db!.from("finder_audit").insert({
      worker_id: workerId,
      actor: "worker",
      action: `api_${safeAction}`.slice(0, 60),
      detail: { ok, ...detail },
    });
  }

  const { count } = await db
    .from("finder_audit")
    .select("id", { count: "exact", head: true })
    .eq("worker_id", workerId)
    .like("action", "api_%")
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());
  if ((count ?? 0) >= PER_MINUTE) {
    return reply(429, { ok: false, error: `too many calls (${PER_MINUTE} a minute), slow down` });
  }

  await db.from("finder_workers").update({ last_seen_at: new Date().toISOString() }).eq("id", workerId);

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    await audit(false, { error: "body too large" });
    return reply(400, { ok: false, error: "request body is too large" });
  }
  let body: Record<string, unknown> = {};
  if (text.trim()) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      body = parsed as Record<string, unknown>;
    } catch {
      await audit(false, { error: "bad json" });
      return reply(400, { ok: false, error: "body must be a JSON object" });
    }
  }

  try {
    switch (action) {
      case "claim": {
        const { limit } = parseClaim(body);
        const { data, error } = await db.rpc("finder_worker_claim", { p_worker: workerId, p_limit: limit });
        if (error) throw new Error(error.message);
        const items = Array.isArray(data) ? data : [];
        await audit(true, { items: items.length });
        return reply(200, { ok: true, data: { items } });
      }
      case "heartbeat": {
        const { item_ids } = parseHeartbeat(body);
        const { data, error } = await db.rpc("finder_worker_heartbeat", { p_worker: workerId, p_items: item_ids });
        if (error) throw new Error(error.message);
        await audit(true, { kept: Number(data ?? 0) });
        return reply(200, { ok: true, data: { kept: Number(data ?? 0) } });
      }
      case "complete": {
        const { item_id, payload } = parseCompletion(body);
        const { data, error } = await db.rpc("finder_worker_complete", {
          p_worker: workerId,
          p_item: item_id,
          p_payload: payload,
        });
        if (error) {
          if (/finder:not_yours/.test(error.message)) {
            await audit(false, { item: item_id, error: "not yours" });
            return reply(409, { ok: false, error: "that item is not claimed by this worker (it may have timed out)" });
          }
          throw new Error(error.message);
        }
        await audit(true, { item: item_id, outcome: payload.outcome });
        return reply(200, { ok: true, data });
      }
      case "discovered": {
        const { item_id, payload } = parseDiscovered(body);
        const { data, error } = await db.rpc("finder_worker_discovered", {
          p_worker: workerId,
          p_item: item_id,
          p_payload: payload,
        });
        if (error) {
          if (/finder:not_yours/.test(error.message)) {
            await audit(false, { item: item_id, error: "not yours" });
            return reply(409, { ok: false, error: "that item is not a discovery run claimed by this worker" });
          }
          throw new Error(error.message);
        }
        await audit(true, { item: item_id, companies: payload.companies.length });
        return reply(200, { ok: true, data });
      }
      case "lookup": {
        const q = parseLookup(body);
        const { data, error } = await db.rpc("finder_worker_lookup", {
          p_website: q.website,
          p_name: q.name,
          p_city: q.city,
        });
        if (error) throw new Error(error.message);
        await audit(true, { known: !!data });
        return reply(200, { ok: true, data: data ?? null });
      }
      default:
        await audit(false, { error: "unknown action" });
        return reply(404, { ok: false, error: "unknown action; use claim, heartbeat, complete, discovered or lookup" });
    }
  } catch (err) {
    if (err instanceof WorkerInputError) {
      await audit(false, { error: err.message.slice(0, 200) });
      return reply(400, { ok: false, error: err.message });
    }
    const msg = err instanceof Error ? err.message : "server error";
    console.error(`[finder-worker] ${safeAction} failed:`, msg);
    await audit(false, { error: msg.slice(0, 200) });
    return reply(500, { ok: false, error: "server error" });
  }
}
