"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireUserAndBusiness } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/demo";
import { BOOKING_COLUMNS, SETTINGS_COLUMNS, mailContextFor, toSettings } from "@/lib/booking-server";
import { sendBookingEmails } from "@/lib/booking-mail";

const ID = /^[0-9a-f-]{36}$/i;

function revalidate(customerId?: string | null, leadId?: string | null) {
  revalidatePath("/bookings");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  if (customerId) revalidatePath(`/customers/${customerId}`);
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

// Attended / No-show / back to Booked. The database lets users change
// only the status (0018); the calendar entry follows.
export async function setBookingStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!ID.test(id) || !["attended", "no_show", "confirmed"].includes(status)) return;
  const { supabase, business } = await requireUserAndBusiness();

  const { data } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", id)
    .eq("business_id", business.id)
    .neq("status", "cancelled")
    .select("id, activity_id, customer_id, lead_id, type_name, name")
    .maybeSingle();
  const b = data as { activity_id: string | null; customer_id: string | null; lead_id: string | null; type_name: string; name: string } | null;
  if (!b) return;

  if (b.activity_id) {
    await supabase
      .from("activities")
      .update({ done_at: status === "confirmed" ? null : new Date().toISOString() })
      .eq("id", b.activity_id)
      .eq("business_id", business.id);
  }
  if (status === "no_show") {
    await supabase.from("activities").insert({
      business_id: business.id,
      customer_id: b.customer_id,
      lead_id: b.lead_id,
      kind: "note",
      subject: `No-show: ${b.type_name}`.slice(0, 300),
      body: `${b.name} didn't come to the booked meeting.`,
      source: "manual",
    });
  }
  revalidate(b.customer_id, b.lead_id);
}

// The owner cancels: the time frees up, the meeting leaves the calendar,
// and the visitor gets a cancellation email (if email is set up).
export async function cancelBookingAsOwner(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!ID.test(id)) return;
  const { supabase, business } = await requireUserAndBusiness();

  const { data } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("business_id", business.id)
    .eq("status", "confirmed")
    .select(BOOKING_COLUMNS)
    .maybeSingle();
  const b = data as (Record<string, unknown> & { id: string; activity_id: string | null; customer_id: string | null; lead_id: string | null; meeting_type_id: string | null }) | null;
  if (!b) return;

  if (b.activity_id) {
    await supabase.from("activities").delete().eq("id", b.activity_id).eq("business_id", business.id);
  }
  await supabase.from("activities").insert({
    business_id: business.id,
    customer_id: b.customer_id,
    lead_id: b.lead_id,
    kind: "note",
    subject: `Booking cancelled by you: ${String(b.type_name)}`.slice(0, 300),
    body: `Was ${new Date(String(b.starts_at)).toUTCString()}.`,
    source: "manual",
  });

  // The visitor's cancel email needs the manage token, which users can't
  // read; the server reads it with the service key for this one row.
  const admin = isDemoMode() ? null : createAdminClient();
  if (admin) {
    const [{ data: tok }, { data: s }, { data: t }] = await Promise.all([
      admin.from("bookings").select("manage_token").eq("id", b.id).eq("business_id", business.id).maybeSingle(),
      admin.from("booking_settings").select(SETTINGS_COLUMNS).eq("business_id", business.id).maybeSingle(),
      b.meeting_type_id
        ? admin.from("booking_meeting_types").select("slug").eq("id", b.meeting_type_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const token = (tok as { manage_token?: string } | null)?.manage_token;
    if (token && s) {
      const ctx = await mailContextFor(
        admin,
        { id: business.id, name: business.name, plan: business.plan, currency: business.currency, owner_id: business.owner_id },
        toSettings(s as Record<string, unknown>),
        (t as { slug?: string } | null)?.slug ?? null,
        await headers()
      );
      await sendBookingEmails(
        "cancelled",
        {
          id: b.id,
          name: String(b.name),
          email: String(b.email),
          phone: null,
          note: null,
          answers: [],
          type_name: String(b.type_name),
          starts_at: String(b.starts_at),
          ends_at: String(b.ends_at),
          location_kind: (b.location_kind as string | null) ?? null,
          location_detail: (b.location_detail as string | null) ?? null,
          visitor_tz: (b.visitor_tz as string | null) ?? null,
          language: String(b.language ?? "en"),
          deposit_cents: null,
          manage_token: token,
        },
        ctx,
        { notifyOwner: false }
      );
    }
  }
  revalidate(b.customer_id, b.lead_id);
}
