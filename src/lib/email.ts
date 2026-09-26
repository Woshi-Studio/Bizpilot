// Sending email from Jephelen. SERVER ONLY.
//
// Provider: EMAIL_PROVIDER env
//   "smtp"   — SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
//              (e.g. Gmail + an app password). ONLY the owner's own
//              businesses (OWNER_BUSINESS_IDS) may send this way.
//   "resend" — RESEND_API_KEY + RESEND_DOMAIN. Everyone may send.
//              From: "<name> via Jephelen <notify@RESEND_DOMAIN>",
//              Reply-To: the user's own email.
//   unset    — nobody sends; the app shows Copy + "coming soon".
//
// Safety:
//   - The recipient is never typed by the user: the server reads it from
//     one of the business's own customers or leads (no open relay).
//   - Emails a day per business by plan (Starter 0, Hustle 50, Boss 200,
//     owner unlimited), counted in the database by consume_email_send()
//     (migrations 0015 + 0017). Fails closed.
//   - Every sent email is logged on the contact's timeline (email_sent).
//   - Secret values are never logged.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Business } from "@/lib/types";
import { isOwnerBusiness } from "@/lib/ai-quota";
import { isDemoMode } from "@/lib/demo";
import { PLAN_LIMITS, normalizePlanValue } from "@/lib/plans";

// Before 0017 every business had 50 a day (0015). Now it's by plan.
export const EMAIL_DAILY_LIMIT = 50;

// Emails a day for this business. null = unlimited (owner).
export function emailDailyLimit(business: { id: string; plan?: string | null }): number | null {
  if (isOwnerBusiness(business.id)) return null;
  return PLAN_LIMITS[normalizePlanValue(business.plan)].email;
}
export const MAX_SUBJECT = 200;
export const MAX_BODY = 20_000;

export type EmailProvider = "smtp" | "resend";

export function emailProvider(): EmailProvider | null {
  const v = (process.env.EMAIL_PROVIDER ?? "").trim().toLowerCase();
  return v === "smtp" || v === "resend" ? v : null;
}

function smtpReady() {
  return ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"].every(
    (k) => !!process.env[k]?.trim()
  );
}

function resendReady() {
  return !!process.env.RESEND_API_KEY?.trim() && !!process.env.RESEND_DOMAIN?.trim();
}

export type EmailStatus =
  | { canSend: true; provider: EmailProvider | "demo" }
  | { canSend: false; reason: "coming_soon" | "not_configured" | "plan" };

// Can this business press "Send"?
export function emailStatus(business: Pick<Business, "id"> & { plan?: string | null }): EmailStatus {
  // Starter has no in-app sending (Copy / Open in my email instead).
  if (emailDailyLimit(business) === 0) return { canSend: false, reason: "plan" };
  if (isDemoMode()) return { canSend: true, provider: "demo" };
  const provider = emailProvider();
  if (provider === "resend" && resendReady()) {
    return { canSend: true, provider };
  }
  if (provider === "smtp" && smtpReady() && isOwnerBusiness(business.id)) {
    return { canSend: true, provider };
  }
  // The owner sees a setup hint; clients see "coming soon".
  return {
    canSend: false,
    reason: isOwnerBusiness(business.id) ? "not_configured" : "coming_soon",
  };
}

// The line shown where Send would be. Never names a setting or env var.
export function emailNote(status: EmailStatus): string {
  if (status.canSend) return "";
  switch (status.reason) {
    case "not_configured":
      return "Email sending isn't connected yet — ask Marlene to finish setup. Copy works in the meantime.";
    case "plan":
      return "Sending straight from Jephelen comes with Hustle (50 a day). Use Copy or Open in my email for now.";
    default:
      return "Sending straight from Jephelen is coming soon. Use Copy or Open in my email for now.";
  }
}

// ------------------------------------------------------------------
// Validation
// ------------------------------------------------------------------

// Deliberately strict: one plain address, no display name, no commas,
// no line breaks (header injection).
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

export function isValidEmail(value: string | null | undefined): value is string {
  if (!value) return false;
  const v = value.trim();
  return v.length <= 254 && EMAIL_RE.test(v);
}

export function cleanSubject(raw: string) {
  return raw.replace(/[\r\n]+/g, " ").trim().slice(0, MAX_SUBJECT);
}

// An AI draft often starts with "Subject: ...". Split it off.
export function splitSubject(text: string): { subject: string; body: string } {
  const m = text.match(/^\s*subject\s*:\s*(.+)\r?\n+([\s\S]*)$/i);
  if (m) return { subject: cleanSubject(m[1]), body: m[2].trim() };
  return { subject: "", body: text.trim() };
}

// ------------------------------------------------------------------
// Recipient: must be one of THIS business's customers or leads
// ------------------------------------------------------------------

export type Recipient = {
  kind: "customer" | "lead";
  id: string;
  name: string;
  email: string;
  business_line: string | null;
};

export async function loadRecipient(
  supabase: SupabaseClient,
  businessId: string,
  kind: string,
  id: string
): Promise<Recipient | { error: string }> {
  if (kind !== "customer" && kind !== "lead") return { error: "Pick a customer or lead." };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Pick a customer or lead." };
  const table = kind === "customer" ? "customers" : "leads";
  const { data } = await supabase
    .from(table)
    .select("id, name, email, business_line")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!data) return { error: "That contact wasn't found." };
  const row = data as { id: string; name: string; email: string | null; business_line?: string | null };
  if (!isValidEmail(row.email)) {
    return { error: `${row.name} has no valid email address. Add one on their page first.` };
  }
  return {
    kind,
    id: row.id,
    name: row.name,
    email: row.email.trim(),
    business_line: row.business_line ?? null,
  };
}

// ------------------------------------------------------------------
// Daily limit
// ------------------------------------------------------------------

export async function consumeEmailSend(
  supabase: SupabaseClient,
  businessId: string
): Promise<{ ok: boolean; used: number; limit: number | null; missing?: boolean }> {
  const { data, error } = await supabase.rpc("consume_email_send", {
    p_business: businessId,
  });
  if (error || !data || typeof data !== "object") {
    console.error(
      "consume_email_send failed (is migration 0015 applied?):",
      error?.message ?? "no data"
    );
    return { ok: false, used: 0, limit: EMAIL_DAILY_LIMIT, missing: true };
  }
  const r = data as { allowed?: unknown; used?: unknown; limit?: unknown };
  return {
    ok: r.allowed === true,
    used: Number(r.used ?? 0),
    // 0017: null = unlimited (owner)
    limit: r.limit === null ? null : Number(r.limit ?? EMAIL_DAILY_LIMIT),
  };
}

// ------------------------------------------------------------------
// Transport
// ------------------------------------------------------------------

export class EmailError extends Error {
  userMessage: string;
  constructor(userMessage: string, detail?: string) {
    super(detail ?? userMessage);
    this.userMessage = userMessage;
  }
}

const SEND_FAILED = "The email didn't go out. Please try again in a minute.";

export type EmailAttachment = { filename: string; content: Buffer; contentType: string };

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export async function deliverEmail(opts: {
  provider: EmailProvider | "demo";
  to: string;
  subject: string;
  text: string;
  fromName: string;
  replyTo: string | null;
  attachments?: EmailAttachment[];
}) {
  const attachments = (opts.attachments ?? []).map((a) => ({
    ...a,
    filename: a.filename.replace(/[\r\n"\\/]/g, "").slice(0, 150) || "attachment",
  }));
  if (attachments.reduce((n, a) => n + a.content.length, 0) > MAX_ATTACHMENT_BYTES) {
    throw new EmailError("The attachment is too large to email (max 10 MB). Send the link instead.");
  }
  if (!isValidEmail(opts.to)) throw new EmailError("That email address doesn't look right.");
  const subject = cleanSubject(opts.subject);
  const text = opts.text.slice(0, MAX_BODY);
  const safeName = opts.fromName.replace(/["<>\r\n]/g, "").trim().slice(0, 80) || "Jephelen user";

  if (opts.provider === "demo") return; // DEMO MODE: pretend

  if (opts.provider === "resend") {
    const domain = (process.env.RESEND_DOMAIN ?? "").trim();
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${safeName} via Jephelen <notify@${domain}>`,
        to: [opts.to],
        subject,
        text,
        ...(isValidEmail(opts.replyTo) ? { reply_to: opts.replyTo } : {}),
        ...(attachments.length
          ? {
              attachments: attachments.map((a) => ({
                filename: a.filename,
                content: a.content.toString("base64"),
              })),
            }
          : {}),
      }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    }).catch((err) => {
      throw new EmailError(SEND_FAILED, `resend network: ${err instanceof Error ? err.name : "error"}`);
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new EmailError(SEND_FAILED, `resend HTTP ${res.status}: ${detail}`);
    }
    return;
  }

  // SMTP (owner only — checked by emailStatus before we get here)
  const nodemailer = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT ?? 465) || 465;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: opts.to,
      subject,
      text,
      ...(isValidEmail(opts.replyTo) ? { replyTo: opts.replyTo } : {}),
      ...(attachments.length ? { attachments } : {}),
    });
  } catch (err) {
    const code = (err as { code?: string; responseCode?: number })?.code ?? "";
    const rc = (err as { responseCode?: number })?.responseCode ?? "";
    throw new EmailError(SEND_FAILED, `smtp failed: ${code} ${rc}`.trim());
  }
}
