// Referrals, paid in Lead Finder credits. No server code, so `node --test`
// can load it. The server side is src/lib/referral-server.ts.
//
//   1. Each business gets a personal link: /signup?ref=<code>.
//   2. Signup keeps the code (user metadata); onboarding checks it and pins
//      the referrer on the new account (app metadata: only the server can
//      write it, so a user can't change who referred them later).
//   3. The referred business's first Stripe payment that clears grants the
//      referrer REFERRAL_CREDITS lead credits through finder_grant, with the
//      reference "referral:<referred business id>": one reward per referred
//      business, and a replayed webhook adds nothing.

import { FREE_MAIL } from "./finder-suppress.ts";

// Change the reward here.
export const REFERRAL_CREDITS = 25;

// Credits from a referral never expire (the 'pack' pool).
export const REFERRAL_POOL = "pack" as const;

export function referralRef(referredBusinessId: string): string {
  return `referral:${referredBusinessId.toLowerCase()}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// The code is the business id, packed short (22 characters, URL-safe).
export function encodeRefCode(businessId: string): string | null {
  if (!UUID_RE.test(businessId)) return null;
  const hex = businessId.replace(/-/g, "").toLowerCase();
  let bits = "";
  for (const h of hex) bits += parseInt(h, 16).toString(2).padStart(4, "0");
  bits = bits.padEnd(132, "0"); // 128 bits -> 22 groups of 6
  let out = "";
  for (let i = 0; i < 132; i += 6) out += B64[parseInt(bits.slice(i, i + 6), 2)];
  return out;
}

export function decodeRefCode(code: string | null | undefined): string | null {
  const c = (code ?? "").trim();
  if (!/^[A-Za-z0-9_-]{22}$/.test(c)) return null;
  let bits = "";
  for (const ch of c) bits += B64.indexOf(ch).toString(2).padStart(6, "0");
  if (!/^0+$/.test(bits.slice(128))) return null; // padding must be zero
  let hex = "";
  for (let i = 0; i < 128; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return UUID_RE.test(id) ? id : null;
}

export function referralLink(siteUrl: string, businessId: string): string | null {
  const code = encodeRefCode(businessId);
  return code ? `${siteUrl.replace(/\/+$/, "")}/signup?ref=${code}` : null;
}

function companyDomain(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return null;
  const d = e.slice(at + 1).replace(/^www\./, "");
  return d && !FREE_MAIL.has(d) ? d : null;
}

export type ReferralParties = {
  referrerBusinessId: string;
  referrerOwnerId: string;
  referrerEmail: string | null;
  referredBusinessId: string;
  referredOwnerId: string;
  referredEmail: string | null;
};

// Why a referral doesn't count, or null when it does. No self-referral:
// same business, same person, or the same company email domain (webmail
// like gmail.com doesn't count as a company).
export function referralBlocked(p: ReferralParties): "same_business" | "same_user" | "same_domain" | null {
  if (p.referrerBusinessId.toLowerCase() === p.referredBusinessId.toLowerCase()) return "same_business";
  if (p.referrerOwnerId === p.referredOwnerId) return "same_user";
  const a = companyDomain(p.referrerEmail);
  const b = companyDomain(p.referredEmail);
  if (a && b && a === b) return "same_domain";
  return null;
}

// The code kept at signup (user metadata, so it may be anything).
export function refFromMetadata(meta: Record<string, unknown> | null | undefined): string | null {
  const v = meta?.["ref"];
  return typeof v === "string" && /^[A-Za-z0-9_-]{22}$/.test(v) ? v : null;
}

// Who referred this account (app metadata, set by the server at onboarding).
export function referrerFromAppMetadata(meta: Record<string, unknown> | null | undefined): string | null {
  const v = meta?.["referred_by"];
  return typeof v === "string" && UUID_RE.test(v) ? v.toLowerCase() : null;
}

// A payment "clears" when money actually moved (a $0 trial invoice doesn't count).
export function paymentCleared(amountPaid: number | null | undefined): boolean {
  return typeof amountPaid === "number" && amountPaid > 0;
}
