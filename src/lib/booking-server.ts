// Booking page on the server. SERVER ONLY.
//
// The public pages (/book/<slug>, /booking/<token>) have no login, so they
// read and write with the service role (createAdminClient), always
// filtered by the one business behind the link, and only through
// booking_create / booking_reschedule / booking_cancel (0018), which check
// every rule again inside one transaction. In DEMO MODE the fake client is
// used instead.

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/demo";
import { isOwnerBusiness } from "@/lib/ai-quota";
import { effectiveTheme, normalizePlanValue, type ThemeId } from "@/lib/plans";
import {
  SLUG_RE,
  TYPE_SLUG_RE,
  bookableTypes,
  bookingLinkLimit,
  isGoogleIcalUrl,
  type BookingLang,
  type BookingSettings,
  type IntakeQuestion,
  type LocationKind,
  type MeetingType,
} from "@/lib/booking";
import { countPerDay, parseWeekly, type BookingRules, type Interval } from "@/lib/booking-time";
import { parseIcalBusy } from "@/lib/ics";

export const SETTINGS_COLUMNS =
  "business_id, slug, enabled, timezone, weekly, min_notice_hours, horizon_days, buffer_before_min, buffer_after_min, max_per_day, language, logo_path, accent, intro, business_line";

export const TYPE_COLUMNS =
  "id, slug, name, duration_min, description, location_kind, location_detail, questions, deposit_cents, business_line, active, position, created_at";

// Everything an owner may read about a booking (no token, no IP hash).
export const BOOKING_COLUMNS =
  "id, business_id, meeting_type_id, activity_id, customer_id, lead_id, type_name, duration_min, location_kind, location_detail, starts_at, ends_at, status, name, email, phone, note, answers, visitor_tz, language, deposit_cents, email_status, created_at, cancelled_at, rescheduled_at";

export async function bookingDb(): Promise<SupabaseClient | null> {
  if (isDemoMode()) {
    const { createDemoClient } = await import("@/lib/demo-client");
    return createDemoClient() as unknown as SupabaseClient;
  }
  return createAdminClient();
}

// ------------------------------------------------------------------
// Tokens and visitor fingerprint
// ------------------------------------------------------------------

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function newManageToken() {
  return randomBytes(32).toString("base64url"); // 43 characters
}

export function hashIp(ip: string | null) {
  if (!ip) return null;
  return createHash("sha256").update(`jephelen-booking:${ip}`).digest("hex");
}

export function clientIp(headers: Headers) {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip") || null;
}

export function siteUrl(headers?: Headers) {
  const env = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (env) return env;
  const host = headers?.get("host");
  if (host && /^[a-z0-9.:-]+$/i.test(host)) {
    return `${host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https"}://${host}`;
  }
  return "https://jephelen.vercel.app";
}

// ------------------------------------------------------------------
// Rows
// ------------------------------------------------------------------

export type SettingsRow = BookingSettings & { business_id: string };

export function toSettings(row: Record<string, unknown>): SettingsRow {
  return {
    business_id: String(row.business_id),
    slug: String(row.slug),
    enabled: !!row.enabled,
    timezone: String(row.timezone ?? "America/Toronto"),
    weekly: parseWeekly(row.weekly) ?? [[], [], [], [], [], [], []],
    min_notice_hours: Number(row.min_notice_hours ?? 4),
    horizon_days: Number(row.horizon_days ?? 60),
    buffer_before_min: Number(row.buffer_before_min ?? 0),
    buffer_after_min: Number(row.buffer_after_min ?? 0),
    max_per_day: row.max_per_day == null ? null : Number(row.max_per_day),
    language: (["en", "fr", "es"].includes(String(row.language)) ? row.language : "en") as BookingLang,
    logo_path: (row.logo_path as string | null) ?? null,
    accent: (row.accent as string | null) ?? null,
    intro: (row.intro as string | null) ?? null,
    business_line: (row.business_line as string | null) ?? null,
  };
}

export function toType(row: Record<string, unknown>): MeetingType {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    duration_min: Number(row.duration_min),
    description: (row.description as string | null) ?? null,
    location_kind: String(row.location_kind ?? "video") as LocationKind,
    location_detail: (row.location_detail as string | null) ?? null,
    questions: Array.isArray(row.questions) ? (row.questions as IntakeQuestion[]) : [],
    deposit_cents: row.deposit_cents == null ? null : Number(row.deposit_cents),
    business_line: (row.business_line as string | null) ?? null,
    active: row.active !== false,
    position: Number(row.position ?? 0),
    created_at: row.created_at ? String(row.created_at) : undefined,
  };
}

export function rulesOf(s: BookingSettings): BookingRules {
  return {
    timezone: s.timezone,
    weekly: s.weekly,
    minNoticeHours: s.min_notice_hours,
    horizonDays: s.horizon_days,
    bufferBeforeMin: s.buffer_before_min,
    bufferAfterMin: s.buffer_after_min,
    maxPerDay: s.max_per_day,
  };
}

export function logoUrl(path: string | null) {
  if (!path || isDemoMode()) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/booking-logos/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export type PublicBooking = {
  business: { id: string; name: string; plan: string; currency: string; owner_id: string };
  settings: SettingsRow;
  types: MeetingType[];
  theme: ThemeId;
  logo: string | null;
};

// The page behind /book/<slug>, or null (unknown, switched off, no service key).
export async function loadPublicBooking(slugRaw: string): Promise<PublicBooking | null> {
  const slug = String(slugRaw ?? "").toLowerCase();
  if (!SLUG_RE.test(slug)) return null;
  const db = await bookingDb();
  if (!db) return null;

  const { data: row } = await db.from("booking_settings").select(SETTINGS_COLUMNS).eq("slug", slug).maybeSingle();
  if (!row) return null;
  const settings = toSettings(row as Record<string, unknown>);
  if (!settings.enabled) return null;

  const [{ data: biz }, { data: typeRows }] = await Promise.all([
    db.from("businesses").select("id, name, plan, currency, owner_id").eq("id", settings.business_id).maybeSingle(),
    db.from("booking_meeting_types").select(TYPE_COLUMNS).eq("business_id", settings.business_id).limit(100),
  ]);
  if (!biz) return null;
  const business = biz as PublicBooking["business"];
  const unlimited = isOwnerBusiness(business.id);
  const types = bookableTypes(
    ((typeRows ?? []) as Record<string, unknown>[]).map(toType),
    bookingLinkLimit(business.plan, unlimited)
  );

  const { data: profile } = await db.from("profiles").select("theme").eq("id", business.owner_id).maybeSingle();
  const theme =
    effectiveTheme((profile as { theme?: string } | null)?.theme, normalizePlanValue(business.plan), unlimited) ?? "clean";

  return { business, settings, types, theme, logo: logoUrl(settings.logo_path) };
}

export function findType(pb: PublicBooking, typeSlug: string) {
  if (!TYPE_SLUG_RE.test(typeSlug)) return null;
  return pb.types.find((t) => t.slug === typeSlug) ?? null;
}

// ------------------------------------------------------------------
// Google busy times (secret iCal address), cached ~15 minutes
// ------------------------------------------------------------------

export const ICAL_TTL_MS = 15 * 60_000;
const ICAL_MAX_BYTES = 5 * 1024 * 1024;

async function fetchIcal(url: string): Promise<string> {
  let current = url;
  // Follow at most 2 redirects, and only to another Google iCal address.
  for (let hop = 0; hop < 3; hop++) {
    if (!isGoogleIcalUrl(current)) throw new Error("not a Google Calendar iCal address");
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
      headers: { Accept: "text/calendar" },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) throw new Error(`redirect without a location`);
      current = new URL(next, current).toString();
      continue;
    }
    if (!res.ok) throw new Error(`Google answered ${res.status}`);
    if (Number(res.headers.get("content-length") ?? 0) > ICAL_MAX_BYTES) throw new Error("calendar too large");
    const reader = res.body?.getReader();
    if (!reader) return await res.text();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > ICAL_MAX_BYTES) {
        await reader.cancel();
        throw new Error("calendar too large");
      }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("that address didn't return a calendar");
    return text;
  }
  throw new Error("too many redirects");
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export type IcalState = { busy: Interval[]; fetchedAt: string | null; error: string | null; events: number };

export async function getIcalBusy(
  db: SupabaseClient,
  businessId: string,
  url: string | null,
  opts: { force?: boolean; timezone?: string } = {}
): Promise<IcalState> {
  if (!url) return { busy: [], fetchedAt: null, error: null, events: 0 };
  const urlHash = sha(url);
  const { data: cached } = await db
    .from("booking_ical_cache")
    .select("fetched_at, url_hash, busy, events, error")
    .eq("business_id", businessId)
    .maybeSingle();
  const row = cached as { fetched_at: string; url_hash: string | null; busy: [string, string][]; events: number; error: string | null } | null;
  const sameUrl = row?.url_hash === urlHash;
  const fromRow = (): Interval[] =>
    sameUrl && Array.isArray(row?.busy)
      ? row!.busy.map(([a, b]) => ({ start: Date.parse(a), end: Date.parse(b) })).filter((i) => i.end > i.start)
      : [];

  if (row && sameUrl && !opts.force && Date.now() - Date.parse(row.fetched_at) < ICAL_TTL_MS) {
    return { busy: fromRow(), fetchedAt: row.fetched_at, error: row.error, events: row.events ?? 0 };
  }

  const now = Date.now();
  let busy: Interval[];
  let error: string | null = null;
  try {
    const text = await fetchIcal(url);
    busy = parseIcalBusy(text, now - 86_400_000, now + 400 * 86_400_000, opts.timezone ?? "UTC");
  } catch (err) {
    error = (err instanceof Error ? err.message : "could not read the calendar").slice(0, 200);
    busy = fromRow(); // keep the last good busy times
  }
  const fetchedAt = new Date().toISOString();
  await db.from("booking_ical_cache").upsert(
    {
      business_id: businessId,
      fetched_at: fetchedAt,
      url_hash: urlHash,
      busy: busy.map((i) => [new Date(i.start).toISOString(), new Date(i.end).toISOString()]),
      events: busy.length,
      error,
    },
    { onConflict: "business_id" }
  );
  if (error) console.error("booking iCal fetch failed:", error);
  return { busy, fetchedAt, error, events: busy.length };
}

// ------------------------------------------------------------------
// Busy times + bookings per day, for the slot list
// ------------------------------------------------------------------

export async function loadBusy(
  db: SupabaseClient,
  settings: SettingsRow,
  from: number,
  to: number,
  exclude?: { bookingId: string; activityId: string | null }
): Promise<{ busy: Interval[]; perDay: Record<string, number> }> {
  const DAY = 86_400_000;
  const [acts, books, icalRow] = await Promise.all([
    db
      .from("activities")
      .select("id, kind, occurred_at, ends_at")
      .eq("business_id", settings.business_id)
      .in("kind", ["meeting", "call", "block"])
      .gte("occurred_at", new Date(from - 31 * DAY).toISOString())
      .lt("occurred_at", new Date(to + DAY).toISOString())
      .limit(5000),
    db
      .from("bookings")
      .select("id, starts_at, ends_at, status")
      .eq("business_id", settings.business_id)
      .neq("status", "cancelled")
      .gte("starts_at", new Date(from - 2 * DAY).toISOString())
      .lt("starts_at", new Date(to + 2 * DAY).toISOString())
      .limit(5000),
    db.from("booking_settings").select("ical_url").eq("business_id", settings.business_id).maybeSingle(),
  ]);

  const busy: Interval[] = [];
  for (const a of (acts.data ?? []) as { id: string; kind: string; occurred_at: string; ends_at: string | null }[]) {
    if (exclude?.activityId && a.id === exclude.activityId) continue;
    const start = Date.parse(a.occurred_at);
    const end = a.ends_at ? Date.parse(a.ends_at) : start + (a.kind === "call" ? 30 : 60) * 60_000;
    if (end > start) busy.push({ start, end });
  }
  const starts: number[] = [];
  for (const b of (books.data ?? []) as { id: string; starts_at: string; ends_at: string }[]) {
    if (exclude && b.id === exclude.bookingId) continue;
    busy.push({ start: Date.parse(b.starts_at), end: Date.parse(b.ends_at) });
    starts.push(Date.parse(b.starts_at));
  }
  const icalUrl = (icalRow.data as { ical_url?: string | null } | null)?.ical_url ?? null;
  if (icalUrl) {
    const ical = await getIcalBusy(db, settings.business_id, icalUrl, { timezone: settings.timezone });
    busy.push(...ical.busy.filter((i) => i.end > from - DAY && i.start < to + DAY));
  }
  return { busy, perDay: countPerDay(starts, settings.timezone) };
}

// booking:<reason> from the database -> the visitor's error key
export function bookingErrorKey(message: string | null | undefined): "taken" | "rate" | "closed" | "unavailable" | "generic" {
  const m = String(message ?? "");
  if (/booking:(taken|full|notice|horizon|hours|grid)|bookings_one_per_start|duplicate key/.test(m)) return "taken";
  if (/booking:rate/.test(m)) return "rate";
  if (/booking:(closed|notfound)/.test(m)) return "closed";
  if (/booking:(disabled|type|plan)/.test(m)) return "unavailable";
  return "generic";
}

// The owner's login email (for "New booking" emails).
export async function ownerEmail(db: SupabaseClient, ownerId: string): Promise<string | null> {
  if (isDemoMode()) return "maya@example.com";
  try {
    const { data } = await db.auth.admin.getUserById(ownerId);
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------
// One booking, by the visitor's manage token
// ------------------------------------------------------------------

export type TokenBooking = {
  booking: Record<string, unknown> & {
    id: string;
    business_id: string;
    meeting_type_id: string | null;
    status: string;
    starts_at: string;
    ends_at: string;
    manage_token: string;
  };
  business: PublicBooking["business"];
  settings: SettingsRow;
  type: MeetingType | null;
  theme: ThemeId;
  logo: string | null;
};

export async function loadBookingByToken(token: string): Promise<TokenBooking | null> {
  if (!TOKEN_RE.test(token)) return null;
  const db = await bookingDb();
  if (!db) return null;
  const { data: row } = await db
    .from("bookings")
    .select(`${BOOKING_COLUMNS}, manage_token`)
    .eq("manage_token", token)
    .maybeSingle();
  if (!row) return null;
  const booking = row as TokenBooking["booking"];
  const [{ data: biz }, { data: s }, { data: t }] = await Promise.all([
    db.from("businesses").select("id, name, plan, currency, owner_id").eq("id", booking.business_id).maybeSingle(),
    db.from("booking_settings").select(SETTINGS_COLUMNS).eq("business_id", booking.business_id).maybeSingle(),
    booking.meeting_type_id
      ? db.from("booking_meeting_types").select(TYPE_COLUMNS).eq("id", booking.meeting_type_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!biz || !s) return null;
  const business = biz as PublicBooking["business"];
  const settings = toSettings(s as Record<string, unknown>);
  const { data: profile } = await db.from("profiles").select("theme").eq("id", business.owner_id).maybeSingle();
  const unlimited = isOwnerBusiness(business.id);
  return {
    booking,
    business,
    settings,
    type: t ? toType(t as Record<string, unknown>) : null,
    theme:
      effectiveTheme((profile as { theme?: string } | null)?.theme, normalizePlanValue(business.plan), unlimited) ?? "clean",
    logo: logoUrl(settings.logo_path),
  };
}

export async function mailContextFor(
  db: SupabaseClient,
  business: PublicBooking["business"],
  settings: SettingsRow,
  typeSlug: string | null,
  headers?: Headers
) {
  return {
    business,
    slug: settings.slug,
    typeSlug,
    timezone: settings.timezone,
    ownerEmail: await ownerEmail(db, business.owner_id),
    base: siteUrl(headers),
  };
}

// The signed-in business's live booking link, or null (not set up / off /
// 0018 not run). For the "Copy my booking link" buttons.
export async function myBookingLink(db: SupabaseClient, businessId: string): Promise<string | null> {
  const { data, error } = await db
    .from("booking_settings")
    .select("slug, enabled")
    .eq("business_id", businessId)
    .maybeSingle();
  const row = data as { slug?: string; enabled?: boolean } | null;
  if (error || !row?.enabled || !row.slug) return null;
  return `${siteUrl(await headers())}/book/${row.slug}`;
}

// The time of this request (pages call it once per render on the server).
export function requestNow() {
  return Date.now();
}
