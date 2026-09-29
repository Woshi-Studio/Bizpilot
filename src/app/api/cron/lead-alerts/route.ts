import { timingSafeEqual } from "node:crypto";
import { runLeadAlertDigests } from "@/lib/lead-alerts-server";

// GET /api/cron/lead-alerts: Vercel Cron, once a day (vercel.json).
// Vercel sends "Authorization: Bearer <CRON_SECRET>"; anything else is 401.
// Emails each business that asked for lead alerts by email one digest of
// the new Lead Finder results (at most one a day).

export const dynamic = "force-dynamic";

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function authorized(request: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (secret.length < 16) return null; // not set up
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(request: Request) {
  const ok = authorized(request);
  if (ok === null) return reply(503, { ok: false, error: "CRON_SECRET is not set" });
  if (!ok) return reply(401, { ok: false, error: "unauthorized" });
  const out = await runLeadAlertDigests();
  return reply(200, { ok: true, ...out });
}
