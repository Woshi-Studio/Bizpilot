import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import BookingShell from "@/components/booking/booking-shell";
import { loadPublicBooking } from "@/lib/booking-server";
import { bt, locationLabel } from "@/lib/booking-i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const pb = await loadPublicBooking(slug);
  return { title: pb ? `Book with ${pb.business.name}` : "Booking" };
}

// /book/<slug>: the meeting types. One type goes straight to its calendar.
export default async function BookingHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pb = await loadPublicBooking(slug);
  if (!pb) notFound();
  if (pb.types.length === 1) redirect(`/book/${pb.settings.slug}/${pb.types[0].slug}`);
  const lang = pb.settings.language;

  return (
    <BookingShell theme={pb.theme} accent={pb.settings.accent} logo={pb.logo} businessName={pb.business.name} lang={lang}>
      <div className="mx-auto max-w-2xl">
        <h1 className="page-title">{bt(lang, "pick_type")}</h1>
        {pb.settings.intro && <p className="page-sub whitespace-pre-line">{pb.settings.intro}</p>}
        {pb.types.length === 0 ? (
          <p className="card mt-6 p-6 text-sm text-muted">{bt(lang, "err_unavailable")}</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {pb.types.map((t) => (
              <li key={t.id}>
                <a href={`/book/${pb.settings.slug}/${t.slug}`} className="card card-hover flex items-center justify-between gap-4 p-5">
                  <div>
                    <p className="text-base font-semibold text-ink">{t.name}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {bt(lang, "minutes", { n: t.duration_min })} · {locationLabel(lang, t.location_kind)}
                    </p>
                    {t.description && <p className="mt-1.5 line-clamp-2 text-sm text-ink-2">{t.description}</p>}
                  </div>
                  <span aria-hidden className="text-xl text-accent-text">
                    →
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BookingShell>
  );
}
