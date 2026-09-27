import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, hashIp, siteUrl } from "@/lib/booking-server";
import { deliverEmail, platformEmailProvider } from "@/lib/email";
import { parseRemoval } from "@/lib/finder";
import { isDemoMode } from "@/lib/demo";

// POST /api/remove-my-data: someone asks us to remove their business data.
// No login. We email a confirm link (proves they control the address);
// nothing is removed until they press Confirm on that page.
// Bot guards: hidden field + minimum time on the page; database rate
// limits (5 an hour per visitor IP, 3 a day per email address).
// The answer is the same whether or not we hold any data about them.

const MAX_BODY = 5_000;

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return reply(413, { ok: false, error: "That's too long." });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false, error: "Please try again." });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return reply(400, { ok: false, error: "Please try again." });
  }

  const parsed = parseRemoval(body);
  if (!parsed.ok) {
    // Pretend a bot succeeded, so it learns nothing.
    if (parsed.error === "bot") return reply(200, { ok: true, emailed: true });
    return reply(400, { ok: false, error: parsed.error });
  }
  if (isDemoMode()) return reply(200, { ok: true, emailed: true });

  const db = createAdminClient();
  if (!db) return reply(503, { ok: false, error: "This form isn't working right now. Please try again later." });

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const v = parsed.value;
  const { error } = await db.rpc("removal_request_create", {
    p_email: v.email,
    p_company: v.company,
    p_website: v.website,
    p_phone: v.phone,
    p_details: v.details,
    p_token_hash: tokenHash,
    p_ip_hash: hashIp(clientIp(request.headers)),
  });
  if (error) {
    if (/removal:rate/.test(error.message)) {
      return reply(429, { ok: false, error: "We've had a few requests from you already. Please check your inbox, or try again tomorrow." });
    }
    console.error("removal_request_create failed:", error.message);
    return reply(500, { ok: false, error: "This form isn't working right now. Please try again later." });
  }

  const provider = platformEmailProvider();
  if (!provider) {
    // Saved; the owner confirms by hand within 30 days.
    return reply(200, { ok: true, emailed: false });
  }
  const link = `${siteUrl(request.headers)}/remove-my-data/confirm?t=${encodeURIComponent(token)}`;
  try {
    await deliverEmail({
      provider,
      to: v.email,
      subject: "Confirm: remove your business data from Jephelen",
      text: [
        "Hi,",
        "",
        "Someone (hopefully you) asked us to remove business data from Jephelen's Lead Finder records.",
        "",
        "To confirm, open this link and press Confirm (it works for 72 hours):",
        link,
        "",
        "If you didn't ask for this, ignore this email. Nothing happens until someone presses Confirm.",
        "",
        "Jephelen",
      ].join("\n"),
      fromName: "Jephelen",
      replyTo: null,
    });
  } catch (err) {
    console.error("removal email failed:", err instanceof Error ? err.message : "error");
    return reply(200, { ok: true, emailed: false });
  }
  return reply(200, { ok: true, emailed: true });
}
