// "Hide ones I have": which Lead Finder results are already in the user's
// leads or customers. Match by email, then website domain, then the
// normalised business name + city. No server code, so `node --test` can
// load it.

import { normCompany, normDomain } from "./finder.ts";

export type HaveRecord = {
  id: string;
  name: string;
  company?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
};

export type HaveMatch = { kind: "lead" | "customer"; id: string; by: "added" | "email" | "domain" | "name" };

export type SuppressTarget = {
  company_name: string;
  email: string | null;
  website: string | null;
  city: string | null;
  lead_id?: string | null;
};

// Webmail domains say nothing about the business, so they never match by domain.
export const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.ca", "hotmail.com", "hotmail.ca", "outlook.com",
  "live.com", "live.ca", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me",
  "protonmail.com", "gmx.com", "mail.com", "yandex.com", "zoho.com", "shaw.ca", "rogers.com",
  "sympatico.ca", "bell.net", "telus.net", "videotron.ca", "cogeco.ca", "comcast.net", "att.net",
  "verizon.net", "sbcglobal.net",
]);

function emailNorm(v: string | null | undefined): string | null {
  const e = (v ?? "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
}

function emailDomain(v: string | null | undefined): string | null {
  const e = emailNorm(v);
  if (!e) return null;
  const d = normDomain(e.split("@")[1]);
  return d && !FREE_MAIL.has(d) ? d : null;
}

function placeNorm(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

type Entry = { kind: HaveMatch["kind"]; rec: HaveRecord; name: string; address: string };

export function buildHaveIndex(leads: HaveRecord[], customers: HaveRecord[]) {
  const byEmail = new Map<string, Entry>();
  const byDomain = new Map<string, Entry>();
  const byName = new Map<string, Entry[]>();
  const add = (kind: HaveMatch["kind"], rec: HaveRecord) => {
    const e: Entry = {
      kind,
      rec,
      name: normCompany(rec.company || rec.name),
      address: placeNorm(rec.address),
    };
    const em = emailNorm(rec.email);
    if (em && !byEmail.has(em)) byEmail.set(em, e);
    for (const d of [normDomain(rec.website), emailDomain(rec.email)]) {
      if (d && !byDomain.has(d)) byDomain.set(d, e);
    }
    // A person's name alone (no company) is a weak key; only company names
    // or names that look like one are indexed.
    if (e.name.length >= 3) byName.set(e.name, [...(byName.get(e.name) ?? []), e]);
    // Also index the person's own name when there is a company too.
    const personName = normCompany(rec.name);
    if (rec.company && personName !== e.name && personName.length >= 3) {
      byName.set(personName, [...(byName.get(personName) ?? []), e]);
    }
  };
  // Customers first: "already a customer" beats "already a lead".
  for (const c of customers) add("customer", c);
  for (const l of leads) add("lead", l);
  return { byEmail, byDomain, byName };
}

export type HaveIndex = ReturnType<typeof buildHaveIndex>;

export function matchHave(idx: HaveIndex, r: SuppressTarget): HaveMatch | null {
  const hit = (e: Entry, by: HaveMatch["by"]): HaveMatch => ({ kind: e.kind, id: e.rec.id, by });
  const em = emailNorm(r.email);
  if (em && idx.byEmail.has(em)) return hit(idx.byEmail.get(em)!, "email");
  for (const d of [normDomain(r.website), emailDomain(r.email)]) {
    if (d && idx.byDomain.has(d)) return hit(idx.byDomain.get(d)!, "domain");
  }
  const name = normCompany(r.company_name);
  const city = placeNorm(r.city);
  for (const e of name.length >= 3 ? idx.byName.get(name) ?? [] : []) {
    // Name + city: the record's address mentions the city. A record with no
    // address can't disagree, so the name alone counts.
    if (!e.address || !city || e.address.includes(city)) return hit(e, "name");
  }
  return null;
}

// What the card says.
export function haveLabel(m: HaveMatch): string {
  const where = m.kind === "customer" ? "Already a customer" : "Already in your leads";
  if (m.by === "added") return "In your leads";
  const by = m.by === "email" ? "same email" : m.by === "domain" ? "same website" : "same name";
  return `${where} (${by})`;
}

// Results the page shows: all, or only the ones the user doesn't have yet.
// A result the user already added to leads counts as "have".
export function applyHide<T extends SuppressTarget>(
  results: T[],
  idx: HaveIndex,
  hide: boolean
): { shown: (T & { have: HaveMatch | null })[]; hidden: number } {
  const marked = results.map((r) => ({
    ...r,
    have: r.lead_id ? ({ kind: "lead", id: r.lead_id, by: "added" } as HaveMatch) : matchHave(idx, r),
  }));
  if (!hide) return { shown: marked, hidden: 0 };
  const shown = marked.filter((r) => !r.have);
  return { shown, hidden: marked.length - shown.length };
}
