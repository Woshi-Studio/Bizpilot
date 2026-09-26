import { timingSafeEqual } from "node:crypto";
import {
  BOOKING_COLUMNS,
  SETTINGS_COLUMNS,
  bookingDb,
  mailContextFor,
  toSettings,
  type PublicBooking,
} from "@/lib/booking-server";
import { sendReminder, type MailBooking, type MailContext } from "@/lib/booking-mail";

// GET /api/cron/reminders — Vercel Cron, every 15 minutes (vercel.json).
// Vercel sends "Authorization: Bearer <CRON_SECRET>"; anything else is 401.
// Sends the 24 h and 1 h reminder emails. Each reminder is claimed in the
// database (reminder_*_at set only if it was still empty) BEFORE sending,
// so two runs at the same time can never send it twice.

export const dynamic = "force-dynamic";

const H = 3_600_000;

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

type Row = MailBooking & { business_id: string; meeting_type_id: string | null; starts_at: string };

export async function GET(request: Request) {
  const ok = authorized(request);
  if (ok === null) return reply(503, { ok: false, error: "CRON_SECRET is not set" });
  if (!ok) return reply(401, { ok: false, error: "unauthorized" });

  const db = await bookingDb();
  if (!db) return reply(503, { ok: false, error: "service key missing" });

  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const pick = (col: "reminder_24h_at" | "reminder_1h_at", within: number) =>
    db
      .from("bookings")
      .select(`${BOOKING_COLUMNS}, manage_token`)
      .eq("status", "confirmed")
      .is(col, null)
      .gt("starts_at", iso(now))
      .lte("starts_at", iso(now + within))
      .order("starts_at")
      .limit(100);

  const [due24, due1] = await Promise.all([pick("reminder_24h_at", 24 * H + 10 * 60_000), pick("reminder_1h_at", 70 * 60_000)]);
  if (due24.error || due1.error) {
    return reply(500, { ok: false, error: "could not read bookings (is 0018 run?)" });
  }

  const contexts = new Map<string, MailContext | null>();
  async function contextFor(r: Row) {
    const key = `${r.business_id}|${r.meeting_type_id ?? ""}`;
    if (contexts.has(key)) return contexts.get(key)!;
    const [{ data: biz }, { data: s }, { data: t }] = await Promise.all([
      db!.from("businesses").select("id, name, plan, currency, owner_id").eq("id", r.business_id).maybeSingle(),
      db!.from("booking_settings").select(SETTINGS_COLUMNS).eq("business_id", r.business_id).maybeSingle(),
      r.meeting_type_id
        ? db!.from("booking_meeting_types").select("slug").eq("id", r.meeting_type_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const ctx =
      biz && s
        ? await mailContextFor(
            db!,
            biz as PublicBooking["business"],
            toSettings(s as Record<string, unknown>),
            (t as { slug?: string } | null)?.slug ?? null,
            request.headers
          )
        : null;
    contexts.set(key, ctx);
    return ctx;
  }

  // Claim first; only the run that flips it from empty sends.
  async function claim(col: "reminder_24h_at" | "reminder_1h_at", id: string) {
    const { data } = await db!
      .from("bookings")
      .update({ [col]: new Date().toISOString() })
      .eq("id", id)
      .is(col, null)
      .eq("status", "confirmed")
      .select("id");
    return Array.isArray(data) && data.length === 1;
  }

  const counts = { sent_24h: 0, sent_1h: 0, skipped: 0, failed: 0 };

  for (const r of (due1.data ?? []) as unknown as Row[]) {
    if (!(await claim("reminder_1h_at", r.id))) continue;
    // a 24 h reminder this late would arrive together with this one
    await claim("reminder_24h_at", r.id);
    const ctx = await contextFor(r);
    const res = ctx ? await sendReminder("1h", r, ctx) : "failed";
    if (res === "sent") counts.sent_1h++;
    else if (res === "failed") counts.failed++;
    else counts.skipped++;
  }

  for (const r of (due24.data ?? []) as unknown as Row[]) {
    if (Date.parse(r.starts_at) - now <= 2 * H) continue; // the 1 h one covers it
    if (!(await claim("reminder_24h_at", r.id))) continue;
    const ctx = await contextFor(r);
    const res = ctx ? await sendReminder("24h", r, ctx) : "failed";
    if (res === "sent") counts.sent_24h++;
    else if (res === "failed") counts.failed++;
    else counts.skipped++;
  }

  return reply(200, { ok: true, ...counts });
}
