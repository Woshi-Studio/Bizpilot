import { generateSlots } from "@/lib/booking-time";
import {
  bookingDb,
  findType,
  loadBookingByToken,
  loadBusy,
  loadPublicBooking,
  rulesOf,
} from "@/lib/booking-server";
import { bookableTypes, bookingLinkLimit } from "@/lib/booking";
import { isOwnerBusiness } from "@/lib/ai-quota";

// GET /api/book/slots?slug=woshi&type=intro-call&from=<ISO>&to=<ISO>
//   (or &token=<manage token> to move an existing booking)
// Free start times, as UTC ISO strings. No login. At most 45 days a call.

const MAX_WINDOW = 45 * 86_400_000;

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const now = Date.now();
  let from = Date.parse(q.get("from") ?? "");
  let to = Date.parse(q.get("to") ?? "");
  if (!Number.isFinite(from)) from = now;
  if (!Number.isFinite(to)) to = from + 31 * 86_400_000;
  if (to - from > MAX_WINDOW) to = from + MAX_WINDOW;
  if (to <= from) return reply(400, { ok: false, error: "bad window" });

  const db = await bookingDb();
  if (!db) return reply(503, { ok: false, error: "unavailable" });

  const token = q.get("token");
  if (token) {
    const tb = await loadBookingByToken(token);
    if (!tb || !tb.type || !tb.settings.enabled) return reply(404, { ok: false, error: "unavailable" });
    const allowed = bookableTypes([tb.type], bookingLinkLimit(tb.business.plan, isOwnerBusiness(tb.business.id)));
    if (!allowed.length) return reply(404, { ok: false, error: "unavailable" });
    const { busy, perDay } = await loadBusy(db, tb.settings, from, to, {
      bookingId: tb.booking.id,
      activityId: (tb.booking.activity_id as string | null) ?? null,
    });
    // its own day doesn't count against max per day
    const own = tb.booking.starts_at;
    const slots = generateSlots({ rules: rulesOf(tb.settings), durationMin: tb.type.duration_min, busy, bookedPerDay: perDay, now, from, to })
      .filter((s) => new Date(s).toISOString() !== new Date(own).toISOString());
    return reply(200, { ok: true, slots: slots.map((s) => new Date(s).toISOString()) });
  }

  const pb = await loadPublicBooking(q.get("slug") ?? "");
  const type = pb ? findType(pb, q.get("type") ?? "") : null;
  if (!pb || !type) return reply(404, { ok: false, error: "unavailable" });
  const { busy, perDay } = await loadBusy(db, pb.settings, from, to);
  const slots = generateSlots({ rules: rulesOf(pb.settings), durationMin: type.duration_min, busy, bookedPerDay: perDay, now, from, to });
  return reply(200, { ok: true, slots: slots.map((s) => new Date(s).toISOString()) });
}
