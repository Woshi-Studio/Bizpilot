// Lead export: ONE CSV format for everything (a single Lead Finder
// result, a whole search/list, and the CRM leads + customers).
// No server code, no path aliases, so `node --test` can load it.

export const EXPORT_COLUMNS = [
  "name",
  "title",
  "company",
  "email",
  "phone",
  "website",
  "city",
  "region",
  "country",
  "source",
  "unlocked_at",
] as const;

export type ExportRow = Record<(typeof EXPORT_COLUMNS)[number], string>;

// Quote when needed; a cell that starts like a spreadsheet formula gets a
// leading ' so Excel / Sheets never run it (CSV injection).
export function csvCell(value: string | null | undefined): string {
  let v = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(rows: ExportRow[]): string {
  const lines = [EXPORT_COLUMNS.join(",")];
  for (const r of rows) lines.push(EXPORT_COLUMNS.map((c) => csvCell(r[c])).join(","));
  // BOM so Excel opens UTF-8 names correctly (same as the money export).
  return "﻿" + lines.join("\r\n");
}

export type ExportableResult = {
  id: string;
  company_name: string;
  website: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  email_checks?: Record<string, unknown> | null;
  source_urls: string[] | null;
  locked: boolean;
  created_at: string;
  contact_name?: string | null;
};

// A Lead Finder result as a CSV row. Locked results are never exported
// (they hold no contacts anyway); an email that failed the free check is
// left out.
export function resultToRow(r: ExportableResult, unlockedAt?: string | null): ExportRow | null {
  if (r.locked) return null;
  const badEmail = (r.email_checks ?? {})["fair"] === "bad";
  return {
    name: r.contact_name ?? "",
    title: "",
    company: r.company_name,
    email: badEmail ? "" : r.email ?? "",
    phone: r.phone ?? "",
    website: r.website ?? "",
    city: r.city ?? "",
    region: r.region ?? "",
    country: r.country ?? "",
    source: (r.source_urls ?? [])[0] ?? "Jephelen Lead Finder",
    unlocked_at: unlockedAt ?? r.created_at,
  };
}

export type CrmRecord = {
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  created_at: string;
  channel?: string | null;
};

// A CRM lead or customer in the same columns. They have no city column,
// so city/region/country stay empty; unlocked_at = when it was added.
export function crmToRow(r: CrmRecord, kind: "lead" | "customer"): ExportRow {
  return {
    name: r.name,
    title: "",
    company: r.company ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    website: r.website ?? "",
    city: "",
    region: "",
    country: "",
    source: kind === "lead" ? `lead (${r.channel ?? "other"})` : "customer",
    unlocked_at: r.created_at,
  };
}

// "My Business" -> "My Business leads 2026-09-29.csv"
export function exportFileName(business: string, what: string, now = new Date()): string {
  const safe = business.replace(/[^a-z0-9-_ ]/gi, "").trim() || "business";
  return `${safe} ${what} ${now.toISOString().slice(0, 10)}.csv`;
}

// Unlock times from the audit log ('unlock' rows, detail.result = id).
export function unlockTimes(rows: { detail: unknown; created_at: string }[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of rows) {
    const id = (row.detail as { result?: unknown } | null)?.result;
    if (typeof id === "string" && !out.has(id)) out.set(id, row.created_at);
  }
  return out;
}
