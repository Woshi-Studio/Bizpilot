// Booking page: shared types, limits and input checks. Pure, so client
// components, server code and `npm test` (booking.test.ts) can all use it.
// The database checks the same things again (0018_booking.sql).

import { isValidTimeZone, parseWeekly, type Weekly } from "./booking-time.ts";

export const BOOKING_DURATIONS = [15, 30, 45, 60] as const;
export type BookingDuration = (typeof BOOKING_DURATIONS)[number];

export const LOCATION_KINDS = ["video", "phone", "in_person", "we_call"] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export const QUESTION_KINDS = ["short", "long", "choice"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const BOOKING_LANGS = ["en", "fr", "es"] as const;
export type BookingLang = (typeof BOOKING_LANGS)[number];

export const BOOKING_STATUSES = ["confirmed", "cancelled", "attended", "no_show"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type IntakeQuestion = {
  id: string; // q1..q10
  label: string;
  kind: QuestionKind;
  required: boolean;
  options: string[]; // choice only
};

export type MeetingType = {
  id: string;
  slug: string;
  name: string;
  duration_min: number;
  description: string | null;
  location_kind: LocationKind;
  location_detail: string | null;
  questions: IntakeQuestion[];
  deposit_cents: number | null;
  business_line: string | null;
  active: boolean;
  position: number;
  created_at?: string;
};

export type BookingSettings = {
  slug: string;
  enabled: boolean;
  timezone: string;
  weekly: Weekly;
  min_notice_hours: number;
  horizon_days: number;
  buffer_before_min: number;
  buffer_after_min: number;
  max_per_day: number | null;
  language: BookingLang;
  logo_path: string | null;
  accent: string | null;
  intro: string | null;
  business_line: string | null;
};

// 3-40 characters: a-z, 0-9 and "-", no "-" at either end.
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const TYPE_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

// Only the owner's own businesses may use these (the database checks too).
export const RESERVED_SLUGS = ["woshi", "jephelen", "vwa", "admin", "api", "book", "booking", "help", "support"];

export const OWNER_DEFAULT_SLUG = "woshi";

export function slugify(text: string, max = 40): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

export function isValidSlug(v: unknown): v is string {
  return typeof v === "string" && SLUG_RE.test(v);
}

// Booking links a plan may have switched on. null = unlimited.
// Keep in sync with plan_limits_internal() in 0018_booking.sql.
export const BOOKING_LINKS: Record<"free" | "premium" | "pro", number | null> = {
  free: 0,
  premium: 1,
  pro: null,
};

export function bookingLinkLimit(plan: string | null | undefined, unlimited = false): number | null {
  if (unlimited) return null;
  return BOOKING_LINKS[plan === "pro" || plan === "premium" ? plan : "free"];
}

export function depositAllowed(plan: string | null | undefined, unlimited = false) {
  return unlimited || plan === "pro";
}

// The order the database uses to decide which links stay live after a
// downgrade: position, then oldest first, then id.
export function sortTypes<T extends { position: number; created_at?: string; id: string }>(types: T[]): T[] {
  return [...types].sort(
    (a, b) =>
      a.position - b.position ||
      String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) ||
      a.id.localeCompare(b.id)
  );
}

// The active types a visitor may book, after the plan limit.
export function bookableTypes<T extends { active: boolean; position: number; created_at?: string; id: string }>(
  types: T[],
  limit: number | null
): T[] {
  const active = sortTypes(types.filter((t) => t.active));
  return limit === null ? active : active.slice(0, Math.max(0, limit));
}

// ------------------------------------------------------------------
// Input checks
// ------------------------------------------------------------------

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };

const int = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isInteger(n) ? n : NaN;
};

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
};

export function parseSettings(raw: Record<string, unknown>): Ok<BookingSettings> | Err {
  const slug = String(raw.slug ?? "").trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return { ok: false, error: "Your link name needs 3–40 letters, numbers or dashes (no dash at the start or end)." };
  }
  const timezone = String(raw.timezone ?? "");
  if (!isValidTimeZone(timezone)) return { ok: false, error: "Pick your time zone." };
  const weekly = parseWeekly(typeof raw.weekly === "string" ? safeJson(raw.weekly) : raw.weekly);
  if (!weekly) return { ok: false, error: "Check your weekly hours: each range needs a start before its end, and ranges can't overlap." };
  const minNotice = int(raw.min_notice_hours);
  if (!(minNotice >= 0 && minNotice <= 720)) return { ok: false, error: "Minimum notice must be 0 to 720 hours." };
  const horizon = int(raw.horizon_days);
  if (!(horizon >= 1 && horizon <= 365)) return { ok: false, error: "How far ahead must be 1 to 365 days." };
  const before = int(raw.buffer_before_min);
  const after = int(raw.buffer_after_min);
  if (!(before >= 0 && before <= 240) || !(after >= 0 && after <= 240)) {
    return { ok: false, error: "Buffers must be 0 to 240 minutes." };
  }
  const maxRaw = String(raw.max_per_day ?? "").trim();
  const max = maxRaw === "" || maxRaw === "0" ? null : int(maxRaw);
  if (max !== null && !(max >= 1 && max <= 50)) return { ok: false, error: "Max per day must be 1 to 50, or empty for no limit." };
  const language = String(raw.language ?? "en") as BookingLang;
  if (!BOOKING_LANGS.includes(language)) return { ok: false, error: "Pick a page language." };
  const accentRaw = String(raw.accent ?? "").trim();
  const accent = accentRaw === "" ? null : /^#[0-9a-fA-F]{6}$/.test(accentRaw) ? accentRaw.toLowerCase() : undefined;
  if (accent === undefined) return { ok: false, error: "The accent color must look like #6d28d9." };
  const intro = text(raw.intro, 1000);
  const line = text(raw.business_line, 60);
  return {
    ok: true,
    value: {
      slug,
      enabled: raw.enabled === true || raw.enabled === "on" || raw.enabled === "true",
      timezone,
      weekly,
      min_notice_hours: minNotice,
      horizon_days: horizon,
      buffer_before_min: before,
      buffer_after_min: after,
      max_per_day: max,
      language,
      logo_path: null, // set by the logo upload, not the form
      accent,
      intro,
      business_line: line,
    },
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function parseQuestions(raw: unknown): Ok<IntakeQuestion[]> | Err {
  const list = typeof raw === "string" ? safeJson(raw) : raw;
  if (list === null || list === undefined || list === "") return { ok: true, value: [] };
  if (!Array.isArray(list)) return { ok: false, error: "The questions didn't save. Try again." };
  if (list.length > 10) return { ok: false, error: "Up to 10 questions per meeting type." };
  const out: IntakeQuestion[] = [];
  for (const [i, q] of list.entries()) {
    if (!q || typeof q !== "object") return { ok: false, error: "The questions didn't save. Try again." };
    const r = q as Record<string, unknown>;
    const label = text(r.label, 200);
    if (!label) return { ok: false, error: `Question ${i + 1} needs some text.` };
    const kind = String(r.kind ?? "short") as QuestionKind;
    if (!QUESTION_KINDS.includes(kind)) return { ok: false, error: `Question ${i + 1}: pick a type.` };
    let options: string[] = [];
    if (kind === "choice") {
      const rawOpts = Array.isArray(r.options) ? r.options : String(r.options ?? "").split("\n");
      options = [...new Set(rawOpts.map((o) => String(o).trim().slice(0, 100)).filter(Boolean))].slice(0, 10);
      if (options.length < 2) return { ok: false, error: `Question ${i + 1}: a choice needs at least 2 options (one per line).` };
    }
    out.push({ id: `q${i + 1}`, label, kind, required: r.required === true || r.required === "on", options });
  }
  return { ok: true, value: out };
}

export type TypeInput = Omit<MeetingType, "id" | "position" | "created_at">;

export function parseMeetingType(raw: Record<string, unknown>): Ok<TypeInput> | Err {
  const name = text(raw.name, 80);
  if (!name) return { ok: false, error: "Give the meeting type a name." };
  const slug = String(raw.slug ?? "").trim().toLowerCase() || slugify(name, 50);
  if (!TYPE_SLUG_RE.test(slug)) return { ok: false, error: "The link end needs letters, numbers or dashes." };
  const duration = int(raw.duration_min);
  if (!(BOOKING_DURATIONS as readonly number[]).includes(duration)) {
    return { ok: false, error: "Pick 15, 30, 45 or 60 minutes." };
  }
  const location = String(raw.location_kind ?? "video") as LocationKind;
  if (!LOCATION_KINDS.includes(location)) return { ok: false, error: "Pick where the meeting happens." };
  const questions = parseQuestions(raw.questions);
  if (!questions.ok) return questions;
  const depRaw = String(raw.deposit ?? "").trim();
  let deposit: number | null = null;
  if (depRaw !== "" && depRaw !== "0") {
    const n = Number(depRaw);
    if (!Number.isFinite(n) || n < 1 || n > 1_000_000) return { ok: false, error: "The deposit must be between 1 and 1,000,000." };
    deposit = Math.round(n * 100);
  }
  return {
    ok: true,
    value: {
      slug,
      name,
      duration_min: duration,
      description: text(raw.description, 1000),
      location_kind: location,
      location_detail: text(raw.location_detail, 300),
      questions: questions.value,
      deposit_cents: deposit,
      business_line: text(raw.business_line, 60),
      active: raw.active === undefined ? true : raw.active === true || raw.active === "on" || raw.active === "true",
    },
  };
}

// ------------------------------------------------------------------
// The visitor's form
// ------------------------------------------------------------------

export type BookingAnswer = { id: string; label: string; value: string };

export type VisitorInput = {
  name: string;
  email: string;
  phone: string | null;
  note: string | null;
  answers: BookingAnswer[];
};

const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

// Error codes are keys in booking-i18n.ts.
export function parseVisitor(
  raw: Record<string, unknown>,
  questions: IntakeQuestion[]
): Ok<VisitorInput> | { ok: false; error: "name" | "email" | "phone" | "required" } {
  const name = text(raw.name, 120)?.replace(/[\r\n<>]+/g, " ") ?? null;
  if (!name) return { ok: false, error: "name" };
  const email = String(raw.email ?? "").trim();
  if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, error: "email" };
  const phone = text(raw.phone, 50);
  if (phone && !/^[0-9+().\-\s]{5,50}$/.test(phone)) return { ok: false, error: "phone" };
  const note = text(raw.note, 2000);
  const given = (raw.answers && typeof raw.answers === "object" ? raw.answers : {}) as Record<string, unknown>;
  const answers: BookingAnswer[] = [];
  for (const q of questions) {
    let v = text(given[q.id], q.kind === "long" ? 2000 : 300) ?? "";
    if (q.kind === "choice" && v && !q.options.includes(v)) v = "";
    if (q.required && !v) return { ok: false, error: "required" };
    if (v) answers.push({ id: q.id, label: q.label, value: v });
  }
  return { ok: true, value: { name, email, phone, note, answers } };
}

// ------------------------------------------------------------------
// Google "secret address in iCal format"
// ------------------------------------------------------------------

// Only Google Calendar's own iCal feed, so the server can't be pointed at
// anything else (no other host, no port, no login, no redirects).
const GOOGLE_ICAL_PATH = /^\/calendar\/ical\/[^/?#\s]{3,200}\/(private-[0-9a-f]{16,64}|public)\/basic\.ics$/;

export function isGoogleIcalUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  let u: URL;
  try {
    u = new URL(value.trim());
  } catch {
    return false;
  }
  return (
    u.protocol === "https:" &&
    u.hostname === "calendar.google.com" &&
    u.port === "" &&
    u.username === "" &&
    u.password === "" &&
    u.search === "" &&
    u.hash === "" &&
    GOOGLE_ICAL_PATH.test(u.pathname)
  );
}

// "https://calendar.google.com/…/private-••••1a2b/basic.ics"
export function maskIcalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/private-[0-9a-f]+/, (m) => `private-••••${m.slice(-4)}`).replace(/ical\/[^/]+\//, "ical/…/");
}

export function formatMoneyCents(cents: number, currency = "USD", lang = "en") {
  try {
    return new Intl.NumberFormat(lang, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function bookingUrl(base: string, slug: string, typeSlug?: string) {
  const root = base.replace(/\/+$/, "");
  return `${root}/book/${slug}${typeSlug ? `/${typeSlug}` : ""}`;
}
