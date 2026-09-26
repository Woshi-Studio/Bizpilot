import { notFound } from "next/navigation";
import type { Metadata } from "next";
import BookingShell from "@/components/booking/booking-shell";
import BookingWidget from "@/components/booking/booking-widget";
import { findType, loadPublicBooking, requestNow } from "@/lib/booking-server";
import { localDate } from "@/lib/booking-time";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; type: string }> }): Promise<Metadata> {
  const { slug, type } = await params;
  const pb = await loadPublicBooking(slug);
  const t = pb ? findType(pb, type) : null;
  return { title: pb && t ? `${t.name} · ${pb.business.name}` : "Booking" };
}

// /book/<slug>/<type>: pick a day, a time, then the form. No login.
export default async function BookType({ params }: { params: Promise<{ slug: string; type: string }> }) {
  const { slug, type: typeSlug } = await params;
  const pb = await loadPublicBooking(slug);
  const type = pb ? findType(pb, typeSlug) : null;
  if (!pb || !type) notFound();

  const now = requestNow();
  const tz = pb.settings.timezone;
  const initialMonth = localDate(now + pb.settings.min_notice_hours * 3_600_000, tz).slice(0, 7);
  const maxMonth = localDate(now + pb.settings.horizon_days * 86_400_000, tz).slice(0, 7);

  return (
    <BookingShell theme={pb.theme} accent={pb.settings.accent} logo={pb.logo} businessName={pb.business.name} lang={pb.settings.language}>
      <BookingWidget
        slug={pb.settings.slug}
        type={{
          slug: type.slug,
          name: type.name,
          duration_min: type.duration_min,
          description: type.description,
          location_kind: type.location_kind,
          location_detail: type.location_detail,
          questions: type.questions,
          deposit_cents: type.deposit_cents,
        }}
        lang={pb.settings.language}
        businessName={pb.business.name}
        intro={pb.settings.intro}
        currency={pb.business.currency || "USD"}
        shownAt={now}
        initialMonth={initialMonth}
        maxMonth={maxMonth}
        backHref={pb.types.length > 1 ? `/book/${pb.settings.slug}` : null}
      />
    </BookingShell>
  );
}
