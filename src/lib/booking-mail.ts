// Booking emails: confirmation (+ .ics), owner alert, reminders, moved,
// cancelled. SERVER ONLY. Uses the same provider rules as every other
// email (lib/email.ts): if this business can't send, nothing goes out and
// the booking is marked "not_configured" so the owner sees why.

import { deliverEmail, emailStatus, isValidEmail, type EmailProvider } from "@/lib/email";
import { bookingUrl, formatMoneyCents, type BookingAnswer } from "@/lib/booking";
import { bt, formatWhen, locationLabel } from "@/lib/booking-i18n";
import { isValidTimeZone } from "@/lib/booking-time";
import { buildIcs } from "@/lib/ics";

export type MailBooking = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  note: string | null;
  answers: BookingAnswer[] | unknown;
  type_name: string;
  starts_at: string;
  ends_at: string;
  location_kind: string | null;
  location_detail: string | null;
  visitor_tz: string | null;
  language: string;
  deposit_cents: number | null;
  manage_token: string;
};

export type MailContext = {
  business: { id: string; name: string; plan?: string | null; currency?: string | null };
  slug: string;
  typeSlug: string | null;
  timezone: string;
  ownerEmail: string | null;
  base: string;
};

export type MailResult = "sent" | "not_configured" | "failed";

export function manageLinks(ctx: MailContext, token: string) {
  const manage = `${ctx.base}/booking/${token}`;
  return {
    manage,
    reschedule: `${manage}?do=reschedule`,
    cancel: `${manage}?do=cancel`,
    book: bookingUrl(ctx.base, ctx.slug, ctx.typeSlug ?? undefined),
  };
}

function whereText(b: MailBooking, lang: string) {
  const label = locationLabel(lang, b.location_kind ?? "video");
  return b.location_detail ? `${label}: ${b.location_detail}` : label;
}

export function bookingIcs(b: MailBooking, ctx: MailContext, cancel = false) {
  const links = manageLinks(ctx, b.manage_token);
  return buildIcs({
    uid: `${b.id}@jephelen`,
    start: Date.parse(b.starts_at),
    end: Date.parse(b.ends_at),
    summary: `${b.type_name} · ${ctx.business.name}`,
    description: `${whereText(b, b.language)}\n${bt(b.language, "reschedule")}: ${links.reschedule}\n${bt(b.language, "cancel")}: ${links.cancel}`,
    location: b.location_detail,
    url: links.manage,
    cancel,
    sequence: Math.floor(Date.now() / 1000),
  });
}

function vars(b: MailBooking, ctx: MailContext, forOwner: boolean) {
  const lang = b.language;
  const tz = !forOwner && b.visitor_tz && isValidTimeZone(b.visitor_tz) ? b.visitor_tz : ctx.timezone;
  const links = manageLinks(ctx, b.manage_token);
  const answers = Array.isArray(b.answers)
    ? (b.answers as BookingAnswer[]).map((a) => `${a.label}: ${a.value}`).join("\n")
    : "";
  return {
    name: b.name,
    email: b.email,
    phone: b.phone ?? "-",
    note: b.note ?? "-",
    answers: answers ? `\n${answers}\n` : "",
    type: b.type_name,
    business: ctx.business.name,
    when: formatWhen(Date.parse(b.starts_at), tz, lang),
    tz,
    where: whereText(b, lang),
    reschedule: links.reschedule,
    cancel: links.cancel,
    book: links.book,
    bookings: `${ctx.base}/bookings`,
  };
}

async function send(
  provider: EmailProvider | "demo",
  to: string | null,
  subject: string,
  text: string,
  fromName: string,
  replyTo: string | null,
  ics?: { content: string; cancel?: boolean }
): Promise<boolean> {
  if (!to || !isValidEmail(to)) return false;
  try {
    await deliverEmail({
      provider,
      to,
      subject,
      text,
      fromName,
      replyTo,
      attachments: ics
        ? [{ filename: ics.cancel ? "cancelled.ics" : "invite.ics", content: Buffer.from(ics.content, "utf8"), contentType: "text/calendar; charset=utf-8" }]
        : undefined,
    });
    return true;
  } catch (err) {
    console.error("booking email failed:", err instanceof Error ? err.message : "error");
    return false;
  }
}

// kind: created | moved | cancelled
export async function sendBookingEmails(
  kind: "created" | "moved" | "cancelled",
  b: MailBooking,
  ctx: MailContext,
  extra: { oldStartsAt?: string; notifyVisitor?: boolean; notifyOwner?: boolean } = {}
): Promise<MailResult> {
  const status = emailStatus({ id: ctx.business.id, plan: ctx.business.plan ?? null });
  if (!status.canSend) return "not_configured";
  const provider = status.provider;
  const lang = b.language;
  const v = vars(b, ctx, false);
  const vo = vars(b, ctx, true);
  const from = ctx.business.name;
  let visitorOk = true;
  let ownerOk = true;

  if (kind === "created" || kind === "moved") {
    let body = bt(lang, "mail_confirm_body", v);
    if (b.deposit_cents) {
      body += `\n\n${bt(lang, "deposit_note", { amount: formatMoneyCents(b.deposit_cents, ctx.business.currency ?? "USD", lang) })}`;
    }
    visitorOk = await send(
      provider,
      b.email,
      bt(lang, kind === "created" ? "mail_confirm_subject" : "mail_move_subject", v),
      body,
      from,
      ctx.ownerEmail,
      { content: bookingIcs(b, ctx) }
    );
    ownerOk = await send(
      provider,
      ctx.ownerEmail,
      kind === "created" ? bt(lang, "mail_owner_subject", vo) : bt(lang, "mail_owner_move_subject", vo),
      kind === "created"
        ? bt(lang, "mail_owner_body", vo)
        : bt(lang, "mail_owner_move_body", {
            ...vo,
            old: extra.oldStartsAt ? formatWhen(Date.parse(extra.oldStartsAt), ctx.timezone, lang) : "-",
          }),
      "Jephelen",
      b.email,
      { content: bookingIcs(b, ctx) }
    );
  } else {
    if (extra.notifyVisitor !== false) {
      visitorOk = await send(provider, b.email, bt(lang, "mail_cancel_subject", v), bt(lang, "mail_cancel_body", v), from, ctx.ownerEmail, {
        content: bookingIcs(b, ctx, true),
        cancel: true,
      });
    }
    if (extra.notifyOwner !== false) {
      ownerOk = await send(provider, ctx.ownerEmail, bt(lang, "mail_owner_cancel_subject", vo), bt(lang, "mail_owner_cancel_body", vo), "Jephelen", b.email);
    }
  }
  if (!ownerOk) console.error("booking: the owner alert didn't go out");
  return visitorOk ? "sent" : "failed";
}

export async function sendReminder(which: "24h" | "1h", b: MailBooking, ctx: MailContext): Promise<MailResult> {
  const status = emailStatus({ id: ctx.business.id, plan: ctx.business.plan ?? null });
  if (!status.canSend) return "not_configured";
  const v = { ...vars(b, ctx, false), soon: bt(b.language, which === "24h" ? "soon_24h" : "soon_1h") };
  const ok = await send(
    status.provider,
    b.email,
    bt(b.language, "mail_reminder_subject", v),
    bt(b.language, "mail_reminder_body", v),
    ctx.business.name,
    ctx.ownerEmail
  );
  return ok ? "sent" : "failed";
}
