"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";
import { isOwnerBusiness } from "@/lib/ai-quota";
import { checkLineLimit, ensureUnlimitedFlag } from "@/lib/plan-limits";
import { normalizeLine } from "@/lib/business-lines";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/demo";
import {
  RESERVED_SLUGS,
  bookingLinkLimit,
  depositAllowed,
  isGoogleIcalUrl,
  parseMeetingType,
  parseSettings,
} from "@/lib/booking";
import { getIcalBusy } from "@/lib/booking-server";
import { PLAN_LABELS, normalizePlanValue } from "@/lib/plans";

export type BookingFormState = { error?: string; success?: string; upgrade?: boolean; savedAt?: number };

const MIGRATION = "Booking needs one more setup step — ask Marlene to run migration 0018.";

function dbError(message: string | undefined, owner: boolean): string {
  const m = message ?? "";
  if (/booking_settings_slug_idx|duplicate key.*slug|unique.*slug/i.test(m)) return "That link name is taken. Try another one.";
  if (/booking_meeting_types_business_id_slug|duplicate key/i.test(m)) return "Another meeting type already uses that link end.";
  if (/booking:slug_reserved/.test(m)) return "That link name is reserved. Try another one.";
  if (/booking:timezone/.test(m)) return "Pick your time zone from the list.";
  if (/does not exist|schema cache|relation/i.test(m)) return owner ? MIGRATION : "Booking isn't switched on yet. Please try again later.";
  return "That didn't save. Please try again.";
}

function revalidate() {
  revalidatePath("/settings/booking");
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
}

export async function saveBookingSettings(_prev: BookingFormState, formData: FormData): Promise<BookingFormState> {
  const { supabase, business } = await requireUserAndBusiness();
  const owner = isOwnerBusiness(business.id);
  await ensureUnlimitedFlag(business.id);

  const parsed = parseSettings(Object.fromEntries(formData.entries()));
  if (!parsed.ok) return { error: parsed.error };
  const s = parsed.value;
  s.business_line = normalizeLine(s.business_line);

  if (!owner && RESERVED_SLUGS.includes(s.slug)) return { error: "That link name is reserved. Try another one." };
  const limit = bookingLinkLimit(business.plan, owner);
  if (s.enabled && limit === 0) {
    return {
      error: `Booking links come with Hustle (1 link) and Boss (unlimited). Your ${PLAN_LABELS[normalizePlanValue(business.plan)]} settings can be saved with the page off.`,
      upgrade: true,
    };
  }
  const lineBlock = await checkLineLimit(supabase, business, s.business_line);
  if (lineBlock) return { error: lineBlock.error, upgrade: lineBlock.upgrade };

  // Google iCal: a new address replaces the old; empty keeps it; "remove" clears it.
  const icalRaw = String(formData.get("ical_url") ?? "").trim();
  const removeIcal = formData.get("remove_ical") === "on";
  if (icalRaw && !isGoogleIcalUrl(icalRaw)) {
    return {
      error:
        "That isn't a Google Calendar secret iCal address. It starts with https://calendar.google.com/calendar/ical/ and ends with /basic.ics.",
    };
  }

  const row: Record<string, unknown> = {
    business_id: business.id,
    slug: s.slug,
    enabled: s.enabled,
    timezone: s.timezone,
    weekly: s.weekly,
    min_notice_hours: s.min_notice_hours,
    horizon_days: s.horizon_days,
    buffer_before_min: s.buffer_before_min,
    buffer_after_min: s.buffer_after_min,
    max_per_day: s.max_per_day,
    language: s.language,
    accent: s.accent,
    intro: s.intro,
    business_line: s.business_line,
  };
  if (icalRaw) row.ical_url = icalRaw.trim();
  else if (removeIcal) row.ical_url = null;

  const { error } = await supabase.from("booking_settings").upsert(row, { onConflict: "business_id" });
  if (error) return { error: dbError(error.message, owner) };

  // Read the Google calendar once now, so Settings can say if it worked.
  let note = "";
  if (icalRaw && !isDemoMode()) {
    const admin = createAdminClient();
    if (admin) {
      const res = await getIcalBusy(admin, business.id, icalRaw, { force: true, timezone: s.timezone });
      note = res.error
        ? ` Your Google calendar couldn't be read yet (${res.error}). Check the address.`
        : ` Google calendar connected: ${res.events} busy time${res.events === 1 ? "" : "s"} found.`;
    }
  }

  revalidate();
  return { success: `Saved.${note}`, savedAt: Date.now() };
}

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function uploadBookingLogo(_prev: BookingFormState, formData: FormData): Promise<BookingFormState> {
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "Pick a picture first." };
  const ext = LOGO_TYPES[file.type];
  if (!ext) return { error: "Use a PNG, JPG or WEBP picture." };
  if (file.size > 512 * 1024) return { error: "The logo must be 512 KB or smaller." };
  const bytes = Buffer.from(await file.arrayBuffer());
  const magic = bytes.subarray(0, 12).toString("hex");
  const real =
    (ext === "png" && magic.startsWith("89504e47")) ||
    (ext === "jpg" && magic.startsWith("ffd8ff")) ||
    (ext === "webp" && magic.startsWith("52494646") && bytes.subarray(8, 12).toString() === "WEBP");
  if (!real) return { error: "That file isn't a real picture." };

  const { supabase, business } = await requireUserAndBusiness();
  const owner = isOwnerBusiness(business.id);
  const { data: current, error: readErr } = await supabase
    .from("booking_settings")
    .select("logo_path")
    .eq("business_id", business.id)
    .maybeSingle();
  if (readErr) return { error: dbError(readErr.message, owner) };
  if (!current) return { error: "Save your booking settings first, then add the logo." };

  const path = `${business.id}/logo-${randomBytes(8).toString("hex")}.${ext}`;
  const { error: upErr } = await supabase.storage.from("booking-logos").upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) return { error: owner && /bucket/i.test(upErr.message) ? MIGRATION : "The logo didn't upload. Please try again." };

  const { error } = await supabase.from("booking_settings").update({ logo_path: path }).eq("business_id", business.id);
  if (error) {
    await supabase.storage.from("booking-logos").remove([path]);
    return { error: dbError(error.message, owner) };
  }
  const old = (current as { logo_path: string | null }).logo_path;
  if (old && old.startsWith(`${business.id}/`)) await supabase.storage.from("booking-logos").remove([old]);
  revalidate();
  return { success: "Logo saved.", savedAt: Date.now() };
}

export async function removeBookingLogo() {
  const { supabase, business } = await requireUserAndBusiness();
  const { data } = await supabase.from("booking_settings").select("logo_path").eq("business_id", business.id).maybeSingle();
  const old = (data as { logo_path: string | null } | null)?.logo_path;
  await supabase.from("booking_settings").update({ logo_path: null }).eq("business_id", business.id);
  if (old && old.startsWith(`${business.id}/`)) await supabase.storage.from("booking-logos").remove([old]);
  revalidate();
}

export async function saveMeetingType(_prev: BookingFormState, formData: FormData): Promise<BookingFormState> {
  const { supabase, business } = await requireUserAndBusiness();
  const owner = isOwnerBusiness(business.id);
  const id = String(formData.get("id") ?? "").trim();
  if (id && !/^[0-9a-f-]{36}$/i.test(id)) return { error: "That meeting type wasn't found." };

  const parsed = parseMeetingType(Object.fromEntries(formData.entries()));
  if (!parsed.ok) return { error: parsed.error };
  const t = parsed.value;
  t.business_line = normalizeLine(t.business_line);

  if (t.deposit_cents !== null && !depositAllowed(business.plan, owner)) {
    return { error: "Deposits come with Boss. Leave the deposit empty, or upgrade.", upgrade: true };
  }
  const lineBlock = await checkLineLimit(supabase, business, t.business_line);
  if (lineBlock) return { error: lineBlock.error, upgrade: lineBlock.upgrade };

  // Live links by plan: Starter 0, Hustle 1, Boss / owner unlimited.
  const limit = bookingLinkLimit(business.plan, owner);
  if (t.active && limit !== null) {
    const { data: live } = await supabase
      .from("booking_meeting_types")
      .select("id")
      .eq("business_id", business.id)
      .eq("active", true);
    const others = ((live ?? []) as { id: string }[]).filter((r) => r.id !== id).length;
    if (others >= limit) {
      return {
        error:
          limit === 0
            ? "Booking links come with Hustle (1 link, $5 every 4 weeks) and Boss (unlimited). You can save it switched off."
            : `Hustle includes ${limit} live booking link. Switch another one off, or go Boss for unlimited links.`,
        upgrade: true,
      };
    }
  }

  const row = {
    slug: t.slug,
    name: t.name,
    duration_min: t.duration_min,
    description: t.description,
    location_kind: t.location_kind,
    location_detail: t.location_detail,
    questions: t.questions,
    deposit_cents: t.deposit_cents,
    business_line: t.business_line,
    active: t.active,
  };
  const { error } = id
    ? await supabase.from("booking_meeting_types").update(row).eq("id", id).eq("business_id", business.id)
    : await supabase.from("booking_meeting_types").insert({ ...row, business_id: business.id });
  if (error) {
    if (/plan_limit:booking/.test(error.message)) return { error: "Your plan's booking links are all in use.", upgrade: true };
    if (/plan_limit:deposit/.test(error.message)) return { error: "Deposits come with Boss.", upgrade: true };
    return { error: dbError(error.message, owner) };
  }
  revalidate();
  return { success: id ? "Saved." : "Meeting type added.", savedAt: Date.now() };
}

export async function deleteMeetingType(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const { supabase, business } = await requireUserAndBusiness();
  await supabase.from("booking_meeting_types").delete().eq("id", id).eq("business_id", business.id);
  revalidate();
}
