import Link from "next/link";
import { headers } from "next/headers";
import { requireUserAndBusiness } from "@/lib/data";
import { isOwnerBusiness } from "@/lib/ai-quota";
import { loadBusinessLines } from "@/lib/activities";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/demo";
import { PLAN_LABELS, normalizePlanValue } from "@/lib/plans";
import { OWNER_DEFAULT_SLUG, bookingLinkLimit, depositAllowed, maskIcalUrl, slugify } from "@/lib/booking";
import { defaultWeekly } from "@/lib/booking-time";
import { SETTINGS_COLUMNS, TYPE_COLUMNS, logoUrl, siteUrl, toSettings, toType } from "@/lib/booking-server";
import { emailStatus } from "@/lib/email";
import CopyBookingLink from "@/components/copy-booking-link";
import BookingSettingsForm from "./booking-settings-form";
import MeetingTypes from "./meeting-types";
import LogoForm from "./logo-form";

export const metadata = { title: "Booking" };

export default async function BookingSettingsPage() {
  const { supabase, business } = await requireUserAndBusiness();
  const owner = isOwnerBusiness(business.id);
  const plan = normalizePlanValue(business.plan);
  const limit = bookingLinkLimit(plan, owner);

  const [settingsRes, icalRow, typesRes, lines] = await Promise.all([
    supabase.from("booking_settings").select(SETTINGS_COLUMNS).eq("business_id", business.id).maybeSingle(),
    supabase.from("booking_settings").select("ical_url").eq("business_id", business.id).maybeSingle(),
    supabase
      .from("booking_meeting_types")
      .select(TYPE_COLUMNS)
      .eq("business_id", business.id)
      .order("position")
      .order("created_at")
      .limit(100),
    loadBusinessLines(supabase, business.id),
  ]);

  const missing = !!settingsRes.error && /does not exist|schema cache|relation/i.test(settingsRes.error.message);
  const saved = settingsRes.data ? toSettings(settingsRes.data as Record<string, unknown>) : null;
  const icalUrl = (icalRow.data as { ical_url?: string | null } | null)?.ical_url ?? null;
  const types = ((typesRes.data ?? []) as Record<string, unknown>[]).map(toType);

  // Google sync status (server-only cache table).
  let icalStatus: { fetchedAt: string | null; events: number; error: string | null } | null = null;
  if (icalUrl && !isDemoMode()) {
    const admin = createAdminClient();
    const { data } = admin
      ? await admin.from("booking_ical_cache").select("fetched_at, events, error").eq("business_id", business.id).maybeSingle()
      : { data: null };
    const r = data as { fetched_at: string; events: number; error: string | null } | null;
    icalStatus = r ? { fetchedAt: r.fetched_at, events: r.events, error: r.error } : { fetchedAt: null, events: 0, error: null };
  }

  const base = siteUrl(await headers());
  const link = saved?.enabled ? `${base}/book/${saved.slug}` : null;
  const send = emailStatus(business);

  const defaults = saved ?? {
    slug: owner ? OWNER_DEFAULT_SLUG : slugify(business.name) || "my-booking",
    enabled: false,
    timezone: "",
    weekly: defaultWeekly(),
    min_notice_hours: 4,
    horizon_days: 60,
    buffer_before_min: 0,
    buffer_after_min: 15,
    max_per_day: null,
    language: "en" as const,
    logo_path: null,
    accent: null,
    intro: null,
    business_line: null,
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/settings" className="text-sm text-muted hover:text-ink">
        ← Settings
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Booking page</h1>
          <p className="page-sub">
            Your own booking link. People pick a free time, and it lands on your calendar with a lead and a timeline note.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyBookingLink url={link} />
          <Link href="/bookings" className="btn-ghost btn-sm">
            See bookings
          </Link>
        </div>
      </div>

      {missing && (
        <p className="alert-warn mt-6">
          {owner
            ? "Booking needs one more setup step — ask Marlene to run migration 0018."
            : "Booking isn't switched on yet. Please check back soon."}
        </p>
      )}

      {limit === 0 && (
        <div className="card-empty mt-6 p-5">
          <p className="text-sm">
            <b>Booking links come with Hustle</b> (1 link, $5 every 4 weeks) and <b>Boss</b> (unlimited). You&apos;re on{" "}
            {PLAN_LABELS[plan]}: you can set everything up now and switch it on after upgrading.
          </p>
          <Link href="/settings#plan" className="btn-primary btn-sm mt-3">
            See plans
          </Link>
        </div>
      )}

      {!send.canSend && (
        <p className="alert-info mt-6 text-sm">
          {owner
            ? "Email isn't connected yet, so confirmations and reminders won't be emailed — visitors still see their confirmation on screen, and you'll see a note on each booking. Ask Marlene to finish email setup."
            : "Confirmation emails aren't available on your plan yet. Visitors see their confirmation on screen with Add to calendar."}
        </p>
      )}

      {!missing && (
        <>
          <div className="mt-6">
            <BookingSettingsForm
              defaults={defaults}
              base={base}
              lines={lines}
              ical={icalUrl ? { masked: maskIcalUrl(icalUrl), status: icalStatus } : null}
              locked={limit === 0}
            />
          </div>

          <div className="mt-8">
            <LogoForm logo={logoUrl(saved?.logo_path ?? null)} hasSettings={!!saved} />
          </div>

          <div className="mt-8">
            <MeetingTypes
              types={types}
              lines={lines}
              limit={limit}
              depositOk={depositAllowed(plan, owner)}
              base={base}
              slug={saved?.slug ?? null}
              enabled={!!saved?.enabled}
              currency={business.currency || "USD"}
            />
          </div>
        </>
      )}
    </div>
  );
}
