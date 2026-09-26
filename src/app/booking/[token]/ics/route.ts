import { loadBookingByToken, siteUrl } from "@/lib/booking-server";
import { bookingIcs } from "@/lib/booking-mail";

// GET /booking/<token>/ics — "Add to calendar" for Apple / Outlook.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tb = await loadBookingByToken(token);
  if (!tb) return new Response("Not found", { status: 404 });
  const b = tb.booking;
  const ics = bookingIcs(
    {
      id: b.id,
      name: String(b.name),
      email: String(b.email),
      phone: null,
      note: null,
      answers: [],
      type_name: String(b.type_name),
      starts_at: b.starts_at,
      ends_at: b.ends_at,
      location_kind: (b.location_kind as string | null) ?? null,
      location_detail: (b.location_detail as string | null) ?? null,
      visitor_tz: null,
      language: String(b.language ?? "en"),
      deposit_cents: null,
      manage_token: token,
    },
    {
      business: tb.business,
      slug: tb.settings.slug,
      typeSlug: tb.type?.slug ?? null,
      timezone: tb.settings.timezone,
      ownerEmail: null,
      base: siteUrl(request.headers),
    },
    b.status === "cancelled"
  );
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="booking.ics"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
