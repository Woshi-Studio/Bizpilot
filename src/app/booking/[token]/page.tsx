import { notFound } from "next/navigation";
import type { Metadata } from "next";
import BookingShell from "@/components/booking/booking-shell";
import ManageBooking from "@/components/booking/manage-booking";
import { loadBookingByToken, requestNow } from "@/lib/booking-server";
import { localDate } from "@/lib/booking-time";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your booking", robots: { index: false, follow: false } };

// /booking/<token>: the visitor's confirmation, with Add to calendar,
// Reschedule and Cancel. The 43-character token is the only key.
export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ new?: string; moved?: string; noemail?: string; do?: string }>;
}) {
  const { token } = await params;
  const q = await searchParams;
  const tb = await loadBookingByToken(token);
  if (!tb) notFound();
  const b = tb.booking;
  const now = requestNow();
  const tz = tb.settings.timezone;

  return (
    <BookingShell theme={tb.theme} accent={tb.settings.accent} logo={tb.logo} businessName={tb.business.name} lang={tb.settings.language}>
      <ManageBooking
        token={token}
        lang={String(b.language ?? tb.settings.language)}
        businessName={tb.business.name}
        currency={tb.business.currency || "USD"}
        booking={{
          type_name: String(b.type_name),
          starts_at: b.starts_at,
          ends_at: b.ends_at,
          status: b.status,
          email: String(b.email),
          location_kind: (b.location_kind as string | null) ?? "video",
          location_detail: (b.location_detail as string | null) ?? null,
          visitor_tz: (b.visitor_tz as string | null) ?? null,
          deposit_cents: (b.deposit_cents as number | null) ?? null,
        }}
        type={
          tb.type
            ? {
                slug: tb.type.slug,
                name: tb.type.name,
                duration_min: tb.type.duration_min,
                description: tb.type.description,
                location_kind: tb.type.location_kind,
                location_detail: tb.type.location_detail,
                questions: [],
                deposit_cents: tb.type.deposit_cents,
              }
            : null
        }
        slug={tb.settings.slug}
        bookAgainHref={`/book/${tb.settings.slug}${tb.type ? `/${tb.type.slug}` : ""}`}
        isNew={q.new === "1"}
        moved={q.moved === "1"}
        emailed={q.noemail !== "1" && b.email_status !== "not_configured"}
        open={q.do === "reschedule" ? "reschedule" : q.do === "cancel" ? "cancel" : null}
        past={Date.parse(b.starts_at) < now}
        shownAt={now}
        initialMonth={localDate(now + tb.settings.min_notice_hours * 3_600_000, tz).slice(0, 7)}
        maxMonth={localDate(now + tb.settings.horizon_days * 86_400_000, tz).slice(0, 7)}
      />
    </BookingShell>
  );
}
