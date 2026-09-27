// Lead Finder: shared rules (no server code, no path aliases, so
// `node --test` can load it). See LEAD-FINDER.md and 0019_finder.sql.

type Env = Record<string, string | undefined>;

// Bump when the Acceptable Use page changes in a way users must re-accept.
export const AUP_VERSION = "2026-09-27";

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

export const FINDER_INDUSTRIES = [
  "Restaurants & cafés",
  "Salons & beauty",
  "Trades & home services",
  "Retail shops",
  "Health & wellness",
  "Fitness",
  "Auto",
  "Professional services",
  "Real estate",
  "Events",
  "Non-profits",
  "Other",
] as const;

export const FINDER_RADII = [5, 15, 50] as const;

export const FINDER_COUNTRIES = [
  { value: "CA", label: "Canada" },
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "AU", label: "Australia" },
  { value: "DO", label: "Dominican Republic" },
] as const;

// ------------------------------------------------------------------
// Who may use it (F1: the owner, plus businesses on the invite list)
// ------------------------------------------------------------------

export type FinderAccess = "owner" | "beta" | "none";

function idList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function finderAccess(businessId: string, env: Env): FinderAccess {
  const id = businessId.trim().toLowerCase();
  if (!id) return "none";
  if (idList(env.OWNER_BUSINESS_IDS).includes(id)) return "owner";
  if (idList(env.FINDER_BETA_BUSINESS_IDS).includes(id)) return "beta";
  return "none";
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
  company_sizes: string[];
  place: string | null;
  radius_km: number | null;
  province: string | null;
  country: string | null;
  needs: string[];
  exclude: string;
  aup_version: string;
};

export function parseIntake(f: Fields): Ok<IntakeInput> | Bad {
  const my_business = text(f, "my_business", 200);
  const offer = text(f, "offer", 500);
  if (!my_business) return { ok: false, error: "Tell us about your business." };
  if (!offer) return { ok: false, error: "Tell us what you offer (up to 500 characters)." };
  if (String(f.get("aup") ?? "") !== "yes") {
    return { ok: false, error: "Please read and accept the Acceptable Use rules." };
  }
  const allowedIndustries = new Set<string>(FINDER_INDUSTRIES);
  const industries = [...new Set(f.getAll("industries").map(String))]
    .filter((v) => allowedIndustries.has(v))
    .slice(0, 12);
  const sizes = new Set<string>(FINDER_SIZES.map((s) => s.value));
  const company_sizes = [...new Set(f.getAll("company_sizes").map(String))].filter((v) => sizes.has(v));
  const needValues = new Set<string>(FINDER_NEEDS.map((n) => n.value));
  const needs = [...new Set(f.getAll("needs").map(String))].filter((v) => needValues.has(v));
  const radius = Number(f.get("radius_km"));
  const country = text(f, "country", 2).toUpperCase();
  return {
    ok: true,
    value: {
      my_business,
      offer,
      target: text(f, "target", 500),
      industries,
      company_sizes,
      place: text(f, "place", 120) || null,
      radius_km: (FINDER_RADII as readonly number[]).includes(radius) ? radius : null,
      province: text(f, "province", 60) || null,
      country: FINDER_COUNTRIES.some((c) => c.value === country) ? country : null,
      needs: needs.length ? needs : ["phone", "website"],
      exclude: text(f, "exclude", 1000),
      aup_version: AUP_VERSION,
    },
  };
}

export type SearchInput = {
  company: string;
  city: string | null;
  website: string | null;
  region: string | null;
  country: string | null;
};

export function parseSearch(f: Fields): Ok<SearchInput> | Bad {
  const company = text(f, "company", 200);
  const city = text(f, "city", 120) || null;
  const website = text(f, "website", 300) || null;
  if (!company) return { ok: false, error: "Type the company's name." };
  if (!city && !website) return { ok: false, error: "Add a city or their website, so we find the right one." };
  if (website && !WEBSITE_RE.test(website)) {
    return { ok: false, error: "That website doesn't look right (example: acmeplumbing.ca)." };
  }
  const country = text(f, "country", 2).toUpperCase();
  return {
    ok: true,
    value: {
      company,
      city,
      website,
      region: text(f, "region", 60) || null,
      country: /^[A-Z]{2}$/.test(country) ? country : null,
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
  no_credits: "You're out of Finder credits.",
  no_profile: "Fill in \"What are you hunting?\" first. It takes a minute.",
  bad_input: "Something in the search didn't look right. Check the name, city and website.",
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
};

export function visibleResult(r: FinderResult): FinderResult {
  if (!r.locked) return r;
  return { ...r, phone: null, phone_checks: null, email: null, email_checks: null, contact_form_url: null };
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
