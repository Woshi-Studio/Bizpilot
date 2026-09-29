// Fair credits: when a paid result is delivered with an email, run a free
// check (the address looks right + its domain has a mail server, i.e. MX
// records). If it fails, the credit comes back on its own and the card says
// "Bad email: credit returned". No paid checker, never SMTP probing.
// No server code here (the DNS lookup is passed in), so `node --test` can
// load it. The server side is src/lib/fair-credit-server.ts.

export type FairVerdict =
  | { verdict: "ok" }
  | { verdict: "bad"; reason: "syntax" | "no_domain" | "no_mx" | "null_mx" }
  // DNS timed out or failed: try again later, never refund on a guess.
  | { verdict: "unknown" };

const LOCAL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// Format only: one @, a sane local part, a real-looking domain with a
// letters-only top level. Returns the lower-cased domain or null.
export function emailDomainIfValid(email: string | null | undefined): string | null {
  const e = (email ?? "").trim();
  if (!e || e.length > 254) return null;
  const at = e.lastIndexOf("@");
  if (at < 1 || at !== e.indexOf("@")) return null;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1).toLowerCase().replace(/\.$/, "");
  if (local.length > 64 || !LOCAL_RE.test(local)) return null;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || domain.length > 253) return null;
  if (!labels.every((l) => LABEL_RE.test(l))) return null;
  if (!/^[a-z]{2,63}$/.test(labels[labels.length - 1])) return null;
  return domain;
}

export type MxRecord = { exchange: string; priority: number };
export type ResolveMx = (domain: string) => Promise<MxRecord[]>;

// DNS errors that mean "this domain has no mail server" (vs. a network hiccup).
const NO_DOMAIN_CODES = new Set(["ENOTFOUND", "NXDOMAIN"]);
const NO_MX_CODES = new Set(["ENODATA", "ENORECORDS"]);

export async function checkEmail(email: string | null | undefined, resolveMx: ResolveMx): Promise<FairVerdict> {
  const domain = emailDomainIfValid(email);
  if (!domain) return { verdict: "bad", reason: "syntax" };
  try {
    const mx = await resolveMx(domain);
    if (!mx.length) return { verdict: "bad", reason: "no_mx" };
    // RFC 7505 "null MX": the domain says it takes no mail.
    if (mx.every((r) => !r.exchange || r.exchange === ".")) return { verdict: "bad", reason: "null_mx" };
    return { verdict: "ok" };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code ?? "";
    if (NO_DOMAIN_CODES.has(code)) return { verdict: "bad", reason: "no_domain" };
    if (NO_MX_CODES.has(code)) return { verdict: "bad", reason: "no_mx" };
    return { verdict: "unknown" };
  }
}

export function fairReasonText(reason: string | null | undefined): string {
  switch (reason) {
    case "syntax":
      return "the address isn't written right";
    case "no_domain":
      return "the domain doesn't exist";
    case "no_mx":
    case "null_mx":
      return "the domain has no mail server";
    default:
      return "it failed the email check";
  }
}

export const BAD_EMAIL_LABEL = "Bad email: credit returned";

export type FairCandidate = {
  id: string;
  email: string | null;
  locked: boolean;
  created_at: string;
  email_checks?: Record<string, unknown> | null;
};

// Which delivered results still need the check: unlocked, with an email,
// paid for (a spend row points at it), not checked yet, not already
// reported or refunded, and delivered in the last 30 days (the same window
// as bounce reports).
export function needsFairCheck(
  r: FairCandidate,
  charged: Set<string>,
  reported: Set<string>,
  now = Date.now()
): boolean {
  if (r.locked || !r.email) return false;
  if (!charged.has(r.id) || reported.has(r.id)) return false;
  const fair = (r.email_checks ?? {})["fair"];
  if (fair === "ok" || fair === "bad") return false;
  const t = new Date(r.created_at).getTime();
  return Number.isFinite(t) && now - t <= 30 * 86_400_000;
}

export function isBadEmail(checks: Record<string, unknown> | null | undefined): boolean {
  return (checks ?? {})["fair"] === "bad";
}
