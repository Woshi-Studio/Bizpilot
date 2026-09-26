import Link from "next/link";
import { requireUserAndBusiness } from "@/lib/data";
import { isOwnerBusiness } from "@/lib/ai-quota";
import { BOOKING_COLUMNS, myBookingLink, requestNow } from "@/lib/booking-server";
import type { BookingAnswer } from "@/lib/booking";
import LocalTime from "@/components/local-time";
import CopyBookingLink from "@/components/copy-booking-link";
import { RowActionForm } from "@/components/row-actions";
import { cancelBookingAsOwner, setBookingStatus } from "./actions";

export const metadata = { title: "Bookings" };

type Row = {
  id: string;
  customer_id: string | null;
  lead_id: string | null;
  type_name: string;
  duration_min: number;
  starts_at: string;
  ends_at: string;
  status: "confirmed" | "cancelled" | "attended" | "no_show";
  name: string;
  email: string;
  phone: string | null;
  note: string | null;
  answers: BookingAnswer[] | null;
  email_status: string | null;
  created_at: string;
};

const TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
] as const;

const STATUS: Record<Row["status"], { label: string; cls: string }> = {
  confirmed: { label: "Booked", cls: "bg-indigo-50 text-indigo-700" },
  attended: { label: "Attended", cls: "bg-green-50 text-green-700" },
  no_show: { label: "No-show", cls: "bg-amber-50 text-amber-700" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-500" },
};

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const tab = TABS.some((t) => t.key === rawTab) ? (rawTab as (typeof TABS)[number]["key"]) : "upcoming";
  const { supabase, business } = await requireUserAndBusiness();
  const nowMs = requestNow();
  const now = new Date(nowMs).toISOString();

  let q = supabase.from("bookings").select(BOOKING_COLUMNS).eq("business_id", business.id);
  if (tab === "upcoming") q = q.eq("status", "confirmed").gte("ends_at", now).order("starts_at", { ascending: true });
  else if (tab === "past") q = q.neq("status", "cancelled").lt("ends_at", now).order("starts_at", { ascending: false });
  else q = q.eq("status", "cancelled").order("starts_at", { ascending: false });

  const [res, link] = await Promise.all([q.limit(200), myBookingLink(supabase, business)]);
  const missing = !!res.error;
  const rows = (res.data ?? []) as unknown as Row[];
  const owner = isOwnerBusiness(business.id);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Bookings</h1>
          <p className="page-sub">Everyone who booked through your booking page. They&apos;re on your calendar too.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyBookingLink url={link} />
          <Link href="/settings/booking" className="btn-ghost btn-sm">
            Booking settings
          </Link>
        </div>
      </div>

      <nav className="mt-5 flex gap-2" aria-label="Bookings">
        {TABS.map((t) => (
          <Link key={t.key} href={`/bookings?tab=${t.key}`} className={`chip ${tab === t.key ? "chip-active" : ""}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      {missing ? (
        <p className="alert-warn mt-6">
          {owner ? "Bookings need one more setup step — ask Marlene to run migration 0018." : "Bookings aren't switched on yet."}
        </p>
      ) : rows.length === 0 ? (
        <div className="card-empty mt-6 p-6 text-sm">
          {tab === "upcoming" ? "No upcoming bookings yet. Share your booking link to get some." : "Nothing here yet."}
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((b) => {
            const future = Date.parse(b.starts_at) > nowMs;
            const contactHref = b.customer_id ? `/customers/${b.customer_id}` : b.lead_id ? `/leads/${b.lead_id}` : null;
            const st = STATUS[b.status];
            return (
              <li key={b.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      <LocalTime iso={b.starts_at} /> · {b.duration_min} min
                    </p>
                    <p className="mt-0.5 text-base font-semibold text-ink">
                      {contactHref ? (
                        <Link href={contactHref} className="hover:underline">
                          {b.name}
                        </Link>
                      ) : (
                        b.name
                      )}{" "}
                      <span className="font-normal text-muted">· {b.type_name}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-muted">
                      <a href={`mailto:${b.email}`} className="hover:underline">
                        {b.email}
                      </a>
                      {b.phone && (
                        <>
                          {" · "}
                          <a href={`tel:${b.phone}`} className="hover:underline">
                            {b.phone}
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-text">🌐 Booked online</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                  </div>
                </div>

                {(b.note || (b.answers && b.answers.length > 0)) && (
                  <dl className="mt-3 space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
                    {(b.answers ?? []).map((a) => (
                      <div key={a.id}>
                        <dt className="inline font-medium text-ink-2">{a.label}: </dt>
                        <dd className="inline whitespace-pre-wrap text-ink">{a.value}</dd>
                      </div>
                    ))}
                    {b.note && (
                      <div>
                        <dt className="inline font-medium text-ink-2">Note: </dt>
                        <dd className="inline whitespace-pre-wrap text-ink">{b.note}</dd>
                      </div>
                    )}
                  </dl>
                )}

                {b.email_status === "not_configured" && (
                  <p className="mt-2 text-xs text-muted">
                    Not emailed: email sending isn&apos;t set up, so they only saw the confirmation on screen. Consider sending it yourself.
                  </p>
                )}
                {b.email_status === "failed" && (
                  <p className="mt-2 text-xs text-red-600">The confirmation email didn&apos;t go out. Consider sending it yourself.</p>
                )}

                {b.status !== "cancelled" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {b.status !== "attended" && (
                      <form action={setBookingStatus}>
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="status" value="attended" />
                        <button type="submit" className="btn-secondary btn-sm">
                          ✅ Attended
                        </button>
                      </form>
                    )}
                    {b.status !== "no_show" && (
                      <form action={setBookingStatus}>
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="status" value="no_show" />
                        <button type="submit" className="btn-secondary btn-sm">
                          🚫 No-show
                        </button>
                      </form>
                    )}
                    {b.status !== "confirmed" && (
                      <form action={setBookingStatus}>
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="status" value="confirmed" />
                        <button type="submit" className="btn-ghost btn-sm">
                          Undo
                        </button>
                      </form>
                    )}
                    {b.status === "confirmed" && future && (
                      <RowActionForm
                        action={cancelBookingAsOwner}
                        fields={{ id: b.id }}
                        label="Cancel booking"
                        icon="trash"
                        danger
                        confirmText={`Cancel ${b.name}'s booking? The time frees up and they get a cancellation email (if email is set up).`}
                      />
                    )}
                    <Link href={`/calendar?view=day&date=${b.starts_at.slice(0, 10)}`} className="btn-ghost btn-sm">
                      On calendar
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
