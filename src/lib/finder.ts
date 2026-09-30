// Lead Finder: shared rules (no server code, no path aliases, so
// `node --test` can load it). See LEAD-FINDER.md and 0019_finder.sql.

type Env = Record<string, string | undefined>;

// Bump when the Acceptable Use page changes in a way users must re-accept.
// 2026-09-27.2: + "Business contacts only, never people-searching".
export const AUP_VERSION = "2026-09-27.2";

export const FINDER_NEEDS = [
  { value: "phone", label: "Phone" },
  { value: "website", label: "Website" },
  { value: "email", label: "Email (only if they publish one)" },
  { value: "address", label: "Business address" },
  { value: "decision_maker", label: "A named decision-maker" },
] as const;

export const FINDER_SIZES = [
  { value: "solo", label: "Just the owner" },
  { value: "2-10", label: "2–10 people" },
  { value: "11-50", label: "11–50" },
  { value: "51-200", label: "51–200" },
  { value: "200+", label: "200+" },
] as const;

// Who the user wants as customers. Each bucket maps to OpenStreetMap tags
// in zilla\finder.py (INDUSTRY_TAGS; the table is in LEAD-FINDER.md) for
// "Find me customers". Keep the ids in sync with it.
export const FINDER_INDUSTRIES = [
  { value: "offices", label: "Offices & professional services" },
  { value: "medical", label: "Medical & dental clinics" },
  { value: "seniors", label: "Seniors' homes & care" },
  { value: "pharmacy", label: "Pharmacies" },
  { value: "restaurants", label: "Restaurants, cafés & bars" },
  { value: "grocery", label: "Grocery & convenience" },
  { value: "retail", label: "Retail shops" },
  { value: "construction", label: "Construction & trades" },
  { value: "home_services", label: "Home services & landscaping" },
  { value: "manufacturing", label: "Manufacturing & industrial" },
  { value: "warehousing", label: "Warehousing & logistics" },
  { value: "trucking", label: "Trucking, moving & couriers" },
  { value: "property", label: "Property management" },
  { value: "real_estate", label: "Real estate" },
  { value: "auto", label: "Auto repair & dealers" },
  { value: "beauty", label: "Beauty & salons" },
  { value: "fitness", label: "Fitness & sports" },
  { value: "education", label: "Schools & education" },
  { value: "daycare", label: "Daycare & childcare" },
  { value: "hotels", label: "Hotels & motels" },
  { value: "churches", label: "Churches & places of worship" },
  { value: "nonprofits", label: "Non-profits & community" },
  { value: "government", label: "Government & public buildings" },
  { value: "tech", label: "Tech & IT" },
  { value: "legal", label: "Legal" },
  { value: "accounting", label: "Accounting & tax" },
  { value: "finance", label: "Banks, finance & insurance" },
  { value: "cleaning", label: "Cleaning & laundry" },
  { value: "events", label: "Events & venues" },
  { value: "entertainment", label: "Entertainment & nightlife" },
  { value: "pets", label: "Pets & vets" },
  { value: "agriculture", label: "Farms & agriculture" },
  { value: "media", label: "Media, photo & advertising" },
] as const;

export function industryLabel(value: string): string {
  return FINDER_INDUSTRIES.find((i) => i.value === value)?.label ?? value;
}

// Where to hunt: ONE area choice. Single-country areas also set the
// profile's country (the worker narrows its map lookups to it).
export const FINDER_AREAS = [
  { value: "CA", label: "Canada" },
  { value: "US", label: "USA" },
  { value: "CAUS", label: "Canada + USA" },
  { value: "WORLD", label: "Worldwide" },
] as const;

export type FinderArea = (typeof FINDER_AREAS)[number]["value"];

export function isFinderArea(v: unknown): v is FinderArea {
  return FINDER_AREAS.some((a) => a.value === v);
}

export function areaCountry(area: string | null | undefined): string | null {
  return area === "CA" || area === "US" ? area : null;
}

// Radius around the city: shown in miles, stored in km (0020).
// null = N/A, the whole area.
export const FINDER_RADII = [
  { miles: null, km: null, label: "N/A (whole area)" },
  { miles: 15, km: 24, label: "Within 15 miles" },
  { miles: 50, km: 80, label: "Within 50 miles" },
  { miles: 200, km: 322, label: "Within 200 miles" },
] as const;

export function milesToKm(miles: unknown): number | null {
  const n = Number(miles);
  return FINDER_RADII.find((r) => r.miles !== null && r.miles === n)?.km ?? null;
}

// The closest miles option for a stored km value (old rows used 5/15/50 km).
export function kmToMiles(km: number | null | undefined): number | null {
  if (km === null || km === undefined || !Number.isFinite(km)) return null;
  let best: number | null = null;
  let gap = Infinity;
  for (const r of FINDER_RADII) {
    if (r.km === null) continue;
    const g = Math.abs(r.km - km);
    if (g < gap) {
      gap = g;
      best = r.miles;
    }
  }
  return best;
}

// ------------------------------------------------------------------
// Who may use it, and how (the owner's rules, 2026-09-27):
//   owner   OWNER_BUSINESS_IDS: unlimited, never locked
//   full    Boss (plan 'pro'), or an invited tester: credits, unlocked
//   locked  Starter / Hustle: free searches, locked results
//   none    the Lead Finder isn't open yet (FINDER_OPEN not set) and the
//           business isn't the owner's or on the invite list
// ------------------------------------------------------------------

export type FinderAccess = "owner" | "full" | "locked" | "none";

function idList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isFinderBeta(businessId: string, env: Env): boolean {
  return idList(env.FINDER_BETA_BUSINESS_IDS).includes(businessId.trim().toLowerCase());
}

export function finderOpen(env: Env): boolean {
  return /^(1|true|yes|on)$/i.test((env.FINDER_OPEN ?? "").trim());
}

export function finderAccess(businessId: string, env: Env, plan?: string | null): FinderAccess {
  const id = businessId.trim().toLowerCase();
  if (!id) return "none";
  if (idList(env.OWNER_BUSINESS_IDS).includes(id)) return "owner";
  if (idList(env.FINDER_BETA_BUSINESS_IDS).includes(id)) return "full";
  if (!finderOpen(env)) return "none";
  return plan === "pro" ? "full" : "locked";
}

// Starter / Hustle with lead credits (bought, or the welcome ones) search
// like Boss: each search spends a credit and comes back unlocked. With no
// credits left they fall back to free, locked searches. Boss, testers and
// the owner are unchanged.
export function spendAccess(access: FinderAccess, balance: number): FinderAccess {
  return access === "locked" && Number.isFinite(balance) && balance >= 1 ? "full" : access;
}

// The database's access mode for finder_submit (0020).
export function submitMode(access: FinderAccess): "owner" | "full" | "locked" | null {
  return access === "none" ? null : access;
}

// Starting credits for an invited tester (granted once). 1..100, default 10.
export function betaCredits(env: Env): number {
  const n = Number.parseInt(env.FINDER_BETA_CREDITS ?? "", 10);
  return Number.isFinite(n) && n >= 1 && n <= 100 ? n : 10;
}

// ------------------------------------------------------------------
// Normalising (same rules as finder_norm_* in 0019 and zilla\finder.py)
// ------------------------------------------------------------------

export function normCompany(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(inc|ltd|llc|corp|co|the|limited|incorporated)\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
}

export function normDomain(value: string | null | undefined): string | null {
  const v = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0]
    .split(":")[0]
    .replace(/^www\./, "");
  return v || null;
}

export function normPhone(value: string | null | undefined): string | null {
  let d = (value ?? "").replace(/[^0-9]/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d || null;
}

// ------------------------------------------------------------------
// Form input
// ------------------------------------------------------------------

type Fields = { get(name: string): unknown; getAll(name: string): unknown[] };
type Ok<T> = { ok: true; value: T };
type Bad = { ok: false; error: string };

const text = (f: Fields, key: string, max: number) =>
  String(f.get(key) ?? "")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, max);

const WEBSITE_RE = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(:[0-9]+)?(\/[^\s]*)?$/i;

export type IntakeInput = {
  my_business: string;
  offer: string;
  target: string;
  industries: string[];
  industry_other: string | null;
  company_sizes: string[];
  place: string | null;
  radius_km: number | null;
  province: string | null;
  area: FinderArea;
  country: string | null;
  needs: string[];
  exclude: string;
  aup_version: string;
};

export function parseIntake(f: Fields): Ok<IntakeInput> | Bad {
  const my_business = text(f, "my_business", 200);
  const offer = text(f, "offer", 500);
  if (!my_business) return { ok: false, error: "Tell us what your business does." };
  if (!offer) return { ok: false, error: "Tell us the services you provide (up to 500 characters)." };
  if (String(f.get("aup") ?? "") !== "yes") {
    return { ok: false, error: "Please read and accept the Acceptable Use rules." };
  }
  const allowedIndustries = new Set<string>(FINDER_INDUSTRIES.map((i) => i.value));
  const industries = [...new Set(f.getAll("industries").map(String))]
    .filter((v) => allowedIndustries.has(v))
    .slice(0, 40);
  const sizes = new Set<string>(FINDER_SIZES.map((s) => s.value));
  const company_sizes = [...new Set(f.getAll("company_sizes").map(String))].filter((v) => sizes.has(v));
  const needValues = new Set<string>(FINDER_NEEDS.map((n) => n.value));
  const needs = [...new Set(f.getAll("needs").map(String))].filter((v) => needValues.has(v));
  const areaIn = text(f, "area", 5).toUpperCase();
  const area: FinderArea = isFinderArea(areaIn) ? areaIn : "CA";
  return {
    ok: true,
    value: {
      my_business,
      offer,
      target: text(f, "target", 500),
      industries,
      industry_other: text(f, "industry_other", 120) || null,
      company_sizes,
      place: text(f, "place", 120) || null,
      radius_km: milesToKm(f.get("radius_mi")),
      province: text(f, "province", 60) || null,
      area,
      country: areaCountry(area),
      needs: needs.length ? needs : ["phone", "website"],
      exclude: text(f, "exclude", 1000),
      aup_version: AUP_VERSION,
    },
  };
}

// ------------------------------------------------------------------
// "Remove my business data" (public form)
// ------------------------------------------------------------------

const REMOVAL_EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

export type RemovalInput = {
  email: string;
  company: string | null;
  website: string | null;
  phone: string | null;
  details: string | null;
};

export function parseRemoval(body: Record<string, unknown>, now = Date.now()): Ok<RemovalInput> | Bad {
  const f = { get: (k: string) => body[k], getAll: () => [] };
  // Bots: the hidden field is filled, or the form was sent faster than a person can.
  if (text(f, "website_confirm", 10)) return { ok: false, error: "bot" };
  const shownAt = Number(body.shown_at);
  if (!Number.isFinite(shownAt) || now - shownAt < 2_500) return { ok: false, error: "bot" };
  if (body.confirm !== true && body.confirm !== "yes") {
    return { ok: false, error: "Please confirm this is your data or your business." };
  }
  const email = text(f, "email", 254).toLowerCase();
  if (!REMOVAL_EMAIL_RE.test(email)) return { ok: false, error: "Type the email address we should confirm with." };
  const website = text(f, "website", 300) || null;
  if (website && !WEBSITE_RE.test(website)) return { ok: false, error: "That website doesn't look right." };
  const phone = text(f, "phone", 50) || null;
  if (phone && (normPhone(phone) ?? "").length < 7) return { ok: false, error: "That phone number doesn't look right." };
  return {
    ok: true,
    value: { email, company: text(f, "company", 200) || null, website, phone, details: text(f, "details", 1000) || null },
  };
}

// ------------------------------------------------------------------
// Database errors -> friendly words
// ------------------------------------------------------------------

const FINDER_ERRORS: Record<string, string> = {
  no_credits: "You're out of lead credits. Get more anytime: a pack or the lead subscription (Plans).",
  no_profile: "Tick the Acceptable Use box first.",
  bad_input: "Something in the search didn't look right. Check what you typed.",
  upgrade: "Get lead credits to unlock this result (Plans).",
  locked_cap: `You've used today's free searches. Lead credits have no daily limit: get a pack or the lead subscription (Plans).`,
  no_industries: "Pick at least one kind of customer (or type one under Other) first.",
  discover_busy: "A \"Find me customers\" run is already going. It shows under In progress.",
  rate: "That's a lot of searches in one hour. Try again a little later.",
  kind: "Only single-company searches are open right now.",
  not_found: "That result wasn't found.",
  not_pickable: "That one was already picked.",
  locked: "Unlock this result first.",
  too_late: "Reports are open for 30 days after a result is delivered.",
  already_reported: "You've already reported this one.",
};

export function finderErrorKey(message: string | null | undefined): string | null {
  const m = /finder:([a-z_]+)/.exec(message ?? "");
  return m && m[1] in FINDER_ERRORS ? m[1] : null;
}

export function finderErrorMessage(message: string | null | undefined): string {
  const key = finderErrorKey(message);
  return key ? FINDER_ERRORS[key] : "The search didn't go through. Please try again in a minute.";
}

// ------------------------------------------------------------------
// Freshness ("last checked" badge)
// ------------------------------------------------------------------

export type Freshness = "fresh" | "amber" | "grey";

export function freshness(lastChecked: string | Date | null | undefined, now = Date.now()): Freshness {
  const t = lastChecked ? new Date(lastChecked).getTime() : NaN;
  if (!Number.isFinite(t)) return "grey";
  const days = (now - t) / 86_400_000;
  if (days >= 180) return "grey";
  if (days >= 90) return "amber";
  return "fresh";
}

// "today", "1 day ago", "12 days ago"
export function daysAgoText(iso: string | Date | null | undefined, now = Date.now()): string {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return "date unknown";
  const days = Math.max(0, Math.floor((now - t) / 86_400_000));
  return days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
}

// Results order. "newest" (default): most recently found or re-checked
// first. "fresh": the most recently checked data first.
export type ResultSort = "newest" | "fresh";

export function sortResults<T extends { created_at: string; last_checked_at: string }>(
  rows: T[],
  sort: ResultSort = "newest"
): T[] {
  const ms = (v: string) => {
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  const key = (r: T) =>
    sort === "fresh" ? ms(r.last_checked_at) : Math.max(ms(r.created_at), ms(r.last_checked_at));
  return [...rows].sort((a, b) => key(b) - key(a) || ms(b.created_at) - ms(a.created_at));
}

// ------------------------------------------------------------------
// What the checks say, in plain words. Never "verified deliverable".
// ------------------------------------------------------------------

type Checks = Record<string, unknown> | null | undefined;

export function emailCheckText(checks: Checks): string {
  const c = checks ?? {};
  const parts: string[] = [];
  if (c.format) parts.push("format");
  if (c.mx) parts.push("mail server");
  if (typeof c.on_site === "string") parts.push(`still on their website (${c.on_site})`);
  const bits = parts.length ? `Checked: ${parts.join(", ")}` : "Not checked yet";
  const flags = [c.role ? "a shared inbox (like info@)" : null, c.disposable ? "a throwaway domain" : null]
    .filter(Boolean)
    .join(", ");
  return flags ? `${bits}. Note: ${flags}.` : `${bits}.`;
}

export function phoneCheckText(checks: Checks): string {
  const c = checks ?? {};
  const parts: string[] = [];
  if (c.valid) parts.push(`valid ${typeof c.region === "string" ? c.region + " " : ""}number format`);
  if (typeof c.on_site === "string") parts.push(`listed on their website (${c.on_site})`);
  if (c.osm) parts.push("listed on OpenStreetMap");
  return parts.length ? `Checked: ${parts.join(", ")}.` : "Not checked yet.";
}

// ------------------------------------------------------------------
// The first email: identification + a way to say no (CASL / CAN-SPAM)
// ------------------------------------------------------------------

export function outreachTemplate(opts: {
  company: string;
  website: string | null;
  senderName: string | null;
  senderBusiness: string;
  offer: string | null;
}): { subject: string; body: string } {
  const name = opts.senderName?.trim() || "[your name]";
  const lines = [
    `Hi ${opts.company} team,`,
    "",
    `I'm ${name} from ${opts.senderBusiness}.${opts.offer ? ` ${opts.offer.trim()}` : ""}`,
    "",
    `I found your contact details on ${opts.website ? `your website (${opts.website})` : "your public listing"} and thought this could be useful to you. [One or two lines on why it fits them.]`,
    "",
    "Would a short call next week work?",
    "",
    "If you'd rather not hear from me, just reply \"no thanks\" and I won't contact you again.",
    "",
    name,
    opts.senderBusiness,
    "[your mailing address]",
    "[your phone or website]",
  ];
  return { subject: `A quick idea for ${opts.company}`, body: lines.join("\n") };
}

// ------------------------------------------------------------------
// Results as the page may show them. A locked result never carries
// contact values (the database holds none either).
// ------------------------------------------------------------------

export type FinderResult = {
  id: string;
  company_name: string;
  website: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  address: string | null;
  phone: string | null;
  phone_checks: Checks;
  email: string | null;
  email_checks: Checks;
  contact_form_url: string | null;
  source_urls: string[];
  why: string | null;
  locked: boolean;
  last_checked_at: string;
  lead_id: string | null;
  created_at: string;
  // Person searches: the name the user typed, confirmed on the company's
  // own site. Only on unlocked results.
  contact_name?: string | null;
};

// A locked result shows the company name, place and why it fits. Nothing
// else is ever passed to the page (the database holds none of it either).
export function visibleResult(r: FinderResult): FinderResult {
  if (!r.locked) return r;
  return {
    ...r,
    website: null,
    address: null,
    phone: null,
    phone_checks: null,
    email: null,
    email_checks: null,
    contact_form_url: null,
    source_urls: [],
    contact_name: null,
  };
}

// Only http(s) links are ever rendered.
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(v) ? v : null;
}

export function telHref(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/[^0-9+]/g, "");
  return d.replace(/\+/g, "").length >= 4 ? `tel:${d}` : null;
}
