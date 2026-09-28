// The Lead Finder's one smart search box. Works out what the user typed
// (a company name, a website, a business email, a phone number, or a
// person's name at a company) and turns it into the query the database and
// the worker understand (0020_finder_plans.sql, zilla\finder.py).
//
// No path aliases, so `node --test` can load it. Runs in the browser too
// (the "Looks like an email" chip), so keep it small.

import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

export type DetectedKind = "email" | "domain" | "phone" | "name";
export type QueryKind = "company" | "domain" | "email" | "phone" | "person";

export type Detected = {
  kind: DetectedKind;
  // email: the lower-cased address; domain: the bare domain; phone: digits
  // in our stored form (see normPhone in finder.ts); name: the text.
  value: string;
  domain: string | null;
  freeMail: boolean;
};

// Personal mailbox providers: an address there says nothing about a
// business, so we don't look those up.
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.ca", "yahoo.co.uk", "ymail.com", "rocketmail.com",
  "hotmail.com", "hotmail.ca", "hotmail.co.uk", "outlook.com", "live.com", "live.ca", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com",
  "gmx.net", "mail.com", "yandex.com", "yandex.ru", "zoho.com", "fastmail.com", "hey.com",
  "sympatico.ca", "rogers.com", "bell.net", "shaw.ca", "telus.net", "videotron.ca", "cogeco.ca",
  "comcast.net", "verizon.net", "att.net", "sbcglobal.net",
]);

const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@([A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24})$/;
const DOMAIN_RE = /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}(:[0-9]+)?(\/\S*)?$/i;
const PHONE_CHARS_RE = /^[+()0-9.\-\s/]+(\s*(x|ext\.?)\s*[0-9]{1,6})?$/i;
const PERSON_RE = /^[\p{L}][\p{L}'’.\- ]{1,118}[\p{L}.]$/u;

function bareDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0]
    .split(":")[0]
    .replace(/^www\./, "");
}

// Same form as finder_norm_phone (0019): digits only, a leading North
// American "1" dropped.
function storedPhone(digits: string): string {
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function isFreeMail(domain: string | null | undefined): boolean {
  return !!domain && FREE_MAIL.has(domain.toLowerCase());
}

export function detectQuery(raw: string, defaultCountry: string | null = "CA"): Detected | null {
  const v = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!v) return null;

  const email = EMAIL_RE.exec(v);
  if (email) {
    const domain = email[1].toLowerCase();
    return { kind: "email", value: v.toLowerCase(), domain, freeMail: isFreeMail(domain) };
  }

  if (!v.includes(" ") && DOMAIN_RE.test(v) && /[a-z]/i.test(v.split(".").pop() ?? "")) {
    const domain = bareDomain(v);
    return { kind: "domain", value: domain, domain, freeMail: false };
  }

  const digits = v.replace(/\s*(x|ext\.?)\s*[0-9]{1,6}$/i, "").replace(/[^0-9]/g, "");
  if (PHONE_CHARS_RE.test(v) && digits.length >= 7 && digits.length <= 15) {
    const country = (/^[A-Z]{2}$/.test(defaultCountry ?? "") ? defaultCountry : "CA") as CountryCode;
    const parsed = parsePhoneNumberFromString(v, country);
    let stored = storedPhone(digits);
    if (parsed?.isPossible()) {
      const e164 = parsed.number.replace(/[^0-9]/g, "");
      stored = parsed.countryCallingCode === "1" ? storedPhone(e164) : e164;
    }
    return { kind: "phone", value: stored, domain: null, freeMail: false };
  }

  return { kind: "name", value: v, domain: null, freeMail: false };
}

// The chip under the box.
export function chipText(d: Detected | null, asPerson: boolean): string | null {
  if (!d) return null;
  switch (d.kind) {
    case "email":
      return d.freeMail
        ? `Looks like a personal email (${d.domain}): we only look up business emails`
        : "Looks like an email: we'll look up the business at " + d.domain;
    case "domain":
      return "Looks like a website";
    case "phone":
      return "Looks like a phone number";
    case "name":
      return asPerson ? "A person at a company: add the company below" : "Looks like a company name";
  }
}

// ------------------------------------------------------------------
// The form -> the query
// ------------------------------------------------------------------

type Fields = { get(name: string): unknown };
type Ok<T> = { ok: true; value: T };
type Bad = { ok: false; error: string };

export type SmartQuery = {
  kind: QueryKind;
  // What lists show; the company for a person search.
  company: string;
  city: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  person: string | null;
  region: string | null;
  country: string | null;
};

const text = (f: Fields, key: string, max: number) =>
  String(f.get(key) ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

export function parseSmartSearch(f: Fields, defaultCountry: string | null = "CA"): Ok<SmartQuery> | Bad {
  const q = text(f, "q", 300);
  const city = text(f, "city", 120) || null;
  const countryIn = text(f, "country", 2).toUpperCase();
  const country = /^[A-Z]{2}$/.test(countryIn) ? countryIn : null;
  const region = text(f, "region", 60) || null;
  const d = detectQuery(q, country ?? defaultCountry);
  if (!d) return { ok: false, error: "Type a company, a website, an email, a phone number or a person's name." };

  const base = { city, region, country, website: null, email: null, phone: null, person: null };

  if (d.kind === "email") {
    if (d.freeMail) {
      return {
        ok: false,
        error: `That's a personal email (${d.domain}). We only look up business emails. Try the company's name or website.`,
      };
    }
    return { ok: true, value: { ...base, kind: "email", company: d.domain!, website: d.domain, email: d.value } };
  }
  if (d.kind === "domain") {
    return { ok: true, value: { ...base, kind: "domain", company: d.value, website: d.value } };
  }
  if (d.kind === "phone") {
    return { ok: true, value: { ...base, kind: "phone", company: q.slice(0, 50), phone: d.value } };
  }

  // A name: a company, unless the user said it's a person.
  if (String(f.get("as_person") ?? "") === "1") {
    if (!PERSON_RE.test(d.value) || d.value.split(" ").length < 2) {
      return { ok: false, error: "Type the person's first and last name." };
    }
    const at = text(f, "person_company", 200);
    if (!at) {
      return {
        ok: false,
        error: "Add the company they work at. We only find people listed on their own business's website.",
      };
    }
    const atDomain = detectQuery(at, defaultCountry);
    const website = atDomain?.kind === "domain" ? atDomain.value : null;
    return {
      ok: true,
      value: { ...base, kind: "person", company: website ?? at, website, person: d.value.slice(0, 120) },
    };
  }
  if (d.value.length > 200) return { ok: false, error: "That name is too long." };
  return { ok: true, value: { ...base, kind: "company", company: d.value } };
}
