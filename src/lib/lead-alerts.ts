// Lead alerts: tell the user when new Lead Finder results arrive (a
// researched search finished, a "Find me customers" run delivered).
// In the app (a bell with a count) and/or by email (one digest a day at
// most, with an unsubscribe link). The user picks in Settings.
// No path aliases, so `node --test` can load it.
//
// Where things live (no migration):
//   the choice      -> user_metadata.lead_alerts ("both" | "email" | "app" | "off")
//   last seen       -> user_metadata.lead_alerts_seen_at (set by the server)
//   last digest     -> finder_audit rows, action "lead_alert_email" (server only)

import { createHmac, timingSafeEqual } from "node:crypto";

export const LEAD_ALERT_MODES = [
  { value: "both", label: "Email + App" },
  { value: "email", label: "Email only" },
  { value: "app", label: "App only" },
  { value: "off", label: "Off" },
] as const;

export type LeadAlertMode = (typeof LEAD_ALERT_MODES)[number]["value"];

export const DEFAULT_LEAD_ALERT_MODE: LeadAlertMode = "both";

// At most one alert email per business in this window.
export const DIGEST_EVERY_MS = 20 * 3_600_000;
// A first digest (or a first bell) looks back this far at most.
export const LOOKBACK_MS = 7 * 86_400_000;
// Most companies listed in one email.
export const DIGEST_MAX_LINES = 20;

export function isLeadAlertMode(v: unknown): v is LeadAlertMode {
  return LEAD_ALERT_MODES.some((m) => m.value === v);
}

export function alertMode(meta: Record<string, unknown> | null | undefined): LeadAlertMode {
  const v = meta?.["lead_alerts"];
  return isLeadAlertMode(v) ? v : DEFAULT_LEAD_ALERT_MODE;
}

export const wantsEmail = (m: LeadAlertMode) => m === "both" || m === "email";
export const wantsApp = (m: LeadAlertMode) => m === "both" || m === "app";

function ms(v: string | null | undefined): number {
  const t = v ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

// Results newer than this are "new" for the bell.
export function seenSince(meta: Record<string, unknown> | null | undefined, now = Date.now()): string {
  const seen = ms(typeof meta?.["lead_alerts_seen_at"] === "string" ? (meta["lead_alerts_seen_at"] as string) : null);
  return new Date(Math.max(seen, now - LOOKBACK_MS)).toISOString();
}

// Is a digest allowed now? (one a day at most)
export function digestDue(lastDigestAt: string | null | undefined, now = Date.now()): boolean {
  return now - ms(lastDigestAt) >= DIGEST_EVERY_MS;
}

// What the email covers: results after the last digest AND after the user
// last looked in the app (they've seen those already), within the lookback.
export function digestSince(lastDigestAt: string | null | undefined, seenAt: string | null | undefined, now = Date.now()): string {
  return new Date(Math.max(ms(lastDigestAt), ms(seenAt), now - LOOKBACK_MS)).toISOString();
}

export type DigestResult = { company_name: string; city: string | null; region: string | null };

// The email. Company and place only: never contact details in an email.
export function buildDigest(opts: {
  businessName: string;
  results: DigestResult[];
  siteUrl: string;
  unsubscribeUrl: string;
}): { subject: string; text: string } {
  const n = opts.results.length;
  const site = opts.siteUrl.replace(/\/+$/, "");
  const lines = opts.results.slice(0, DIGEST_MAX_LINES).map((r) => {
    const place = [r.city, r.region].filter(Boolean).join(", ");
    return `- ${r.company_name}${place ? ` (${place})` : ""}`;
  });
  if (n > DIGEST_MAX_LINES) lines.push(`- and ${n - DIGEST_MAX_LINES} more`);
  const text = [
    `Hi,`,
    ``,
    `Jephelen found ${n} new lead${n === 1 ? "" : "s"} for ${opts.businessName}:`,
    ``,
    ...lines,
    ``,
    `See them: ${site}/leads/search#results`,
    ``,
    `You get this at most once a day. Change lead alerts: ${site}/settings#lead-alerts`,
    `Stop these emails: ${opts.unsubscribeUrl}`,
  ].join("\n");
  return { subject: `${n} new lead${n === 1 ? "" : "s"} found for you`, text };
}

// Unsubscribe link: signed, so nobody can switch off someone else's alerts.
export function unsubToken(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(`lead-alerts-unsub:${userId}`).digest("base64url").slice(0, 32);
}

export function unsubValid(userId: string, token: string, secret: string): boolean {
  if (!secret || !/^[0-9a-f-]{36}$/i.test(userId)) return false;
  const want = Buffer.from(unsubToken(userId, secret));
  const got = Buffer.from(String(token ?? ""));
  return got.length === want.length && timingSafeEqual(got, want);
}

// Email off, the bell stays (unless it was email only: then off).
export function modeAfterUnsubscribe(m: LeadAlertMode): LeadAlertMode {
  return m === "both" ? "app" : m === "email" ? "off" : m;
}
