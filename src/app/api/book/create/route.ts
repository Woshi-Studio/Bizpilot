import { isValidTimeZone, isSlotFree } from "@/lib/booking-time";
import { parseVisitor } from "@/lib/booking";
import {
  bookingDb,
  bookingErrorKey,
  clientIp,
  findType,
  hashIp,
  loadBusy,
  loadPublicBooking,
  mailContextFor,
  newManageToken,
  rulesOf,
} from "@/lib/booking-server";
import { sendBookingEmails } from "@/lib/booking-mail";
import { isDemoMode } from "@/lib/demo";
import { DEMO_BOOKING_TOKEN } from "@/lib/demo-data";

// POST /api/book/create — a visitor books a time. No login.
// Bot guards: a hidden "website" field (honeypot), a minimum time on the
// page, and the database's rate limits (IP, email, business).
// The slot is checked here AND again inside booking_create (0018), which
// holds a per-business lock, so two visitors can't take the same time.

const MAX_BODY = 20_000;

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
const fail = (error: string, status = 400) => reply(status, { ok: false, error });

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return fail("generic", 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("generic");
  }
  if (!body || typeof body !== "object") return fail("generic");

  // Bots: filled the hidden field, or submitted faster than a person can.
  if (String(body.website ?? "").trim()) return fail("generic");
  const shownAt = Number(body.shown_at);
  if (!Number.isFinite(shownAt) || Date.now() - shownAt < 2_500) return fail("generic");

  const pb = await loadPublicBooking(String(body.slug ?? ""));
  const type = pb ? findType(pb, String(body.type ?? "")) : null;
  const db = await bookingDb();
  if (!pb || !type || !db) return fail("unavailable", 404);

  const visitor = parseVisitor(body, type.questions);
  if (!visitor.ok) return fail(visitor.error);

  const start = Date.parse(String(body.start ?? ""));
  if (!Number.isFinite(start) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?Z$/.test(String(body.start))) {
    return fail("taken");
  }
  const visitorTz = isValidTimeZone(body.tz) ? body.tz : null;

  const { busy, perDay } = await loadBusy(db, pb.settings, start - 86_400_000, start + 86_400_000);
  if (!isSlotFree({ rules: rulesOf(pb.settings), durationMin: type.duration_min, busy, bookedPerDay: perDay, now: Date.now(), start })) {
    return fail("taken", 409);
  }

  // DEMO MODE: nothing is saved, so show the demo booking's page.
  const token = isDemoMode() ? DEMO_BOOKING_TOKEN : newManageToken();
  const { data, error } = await db.rpc("booking_create", {
    p_business: pb.business.id,
    p_type: type.id,
    p_starts: new Date(start).toISOString(),
    p_name: visitor.value.name,
    p_email: visitor.value.email,
    p_phone: visitor.value.phone,
    p_note: visitor.value.note,
    p_answers: visitor.value.answers,
    p_visitor_tz: visitorTz,
    p_language: pb.settings.language,
    p_token: token,
    p_ip_hash: hashIp(clientIp(request.headers)),
  });
  if (error || !data) {
    const key = bookingErrorKey(error?.message);
    if (key === "generic") console.error("booking_create failed:", error?.message ?? "no data");
    return fail(key, key === "taken" ? 409 : key === "rate" ? 429 : 400);
  }
  const made = data as { booking_id: string; starts_at: string; ends_at: string };

  const ctx = await mailContextFor(db, pb.business, pb.settings, type.slug, request.headers);
  const emailed = await sendBookingEmails(
    "created",
    {
      id: made.booking_id,
      name: visitor.value.name,
      email: visitor.value.email,
      phone: visitor.value.phone,
      note: visitor.value.note,
      answers: visitor.value.answers,
      type_name: type.name,
      starts_at: new Date(made.starts_at).toISOString(),
      ends_at: new Date(made.ends_at).toISOString(),
      location_kind: type.location_kind,
      location_detail: type.location_detail,
      visitor_tz: visitorTz,
      language: pb.settings.language,
      deposit_cents: type.deposit_cents,
      manage_token: token,
    },
    ctx
  );
  await db.from("bookings").update({ email_status: emailed }).eq("id", made.booking_id).eq("business_id", pb.business.id);

  return reply(200, { ok: true, token, emailed: emailed === "sent" });
}
