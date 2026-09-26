import { isSlotFree } from "@/lib/booking-time";
import {
  TOKEN_RE,
  bookingDb,
  bookingErrorKey,
  loadBookingByToken,
  loadBusy,
  mailContextFor,
  rulesOf,
} from "@/lib/booking-server";
import { sendBookingEmails, type MailBooking } from "@/lib/booking-mail";

// POST /api/book/manage — the visitor's own reschedule / cancel link.
//   { token, action: "cancel" }
//   { token, action: "reschedule", start: <UTC ISO> }
// The 43-character token is the only key; the database checks the rest.

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
const fail = (error: string, status = 400) => reply(status, { ok: false, error });

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 2_000) return fail("generic", 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("generic");
  }
  const token = String(body?.token ?? "");
  const action = String(body?.action ?? "");
  if (!TOKEN_RE.test(token) || !["cancel", "reschedule"].includes(action)) return fail("generic");

  const db = await bookingDb();
  const tb = await loadBookingByToken(token);
  if (!db || !tb) return fail("closed", 404);
  const b = tb.booking;
  const ctx = await mailContextFor(db, tb.business, tb.settings, tb.type?.slug ?? null, request.headers);
  const mail = (starts: string, ends: string): MailBooking => ({
    id: b.id,
    name: String(b.name),
    email: String(b.email),
    phone: (b.phone as string | null) ?? null,
    note: (b.note as string | null) ?? null,
    answers: b.answers,
    type_name: String(b.type_name),
    starts_at: starts,
    ends_at: ends,
    location_kind: (b.location_kind as string | null) ?? null,
    location_detail: (b.location_detail as string | null) ?? null,
    visitor_tz: (b.visitor_tz as string | null) ?? null,
    language: String(b.language ?? "en"),
    deposit_cents: (b.deposit_cents as number | null) ?? null,
    manage_token: token,
  });

  if (action === "cancel") {
    const { error } = await db.rpc("booking_cancel", { p_token: token });
    if (error) return fail(bookingErrorKey(error.message));
    await sendBookingEmails("cancelled", mail(b.starts_at, b.ends_at), ctx);
    return reply(200, { ok: true });
  }

  const start = Date.parse(String(body.start ?? ""));
  if (!Number.isFinite(start) || !tb.type) return fail("taken");
  const { busy, perDay } = await loadBusy(db, tb.settings, start - 86_400_000, start + 86_400_000, {
    bookingId: b.id,
    activityId: (b.activity_id as string | null) ?? null,
  });
  if (!isSlotFree({ rules: rulesOf(tb.settings), durationMin: tb.type.duration_min, busy, bookedPerDay: perDay, now: Date.now(), start })) {
    return fail("taken", 409);
  }
  const { data, error } = await db.rpc("booking_reschedule", { p_token: token, p_starts: new Date(start).toISOString() });
  if (error || !data) return fail(bookingErrorKey(error?.message), 409);
  const moved = data as { old_starts_at: string; starts_at: string; ends_at: string };
  await sendBookingEmails("moved", mail(new Date(moved.starts_at).toISOString(), new Date(moved.ends_at).toISOString()), ctx, {
    oldStartsAt: moved.old_starts_at,
  });
  return reply(200, { ok: true });
}
