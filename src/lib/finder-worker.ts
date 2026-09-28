// Lead Finder worker (Zilla on the owner's PC): key format and the
// checks on what it sends. No path aliases, so `node --test` can load it.
//
// Keys: jph_work_ + 32 random bytes in base62 (43 characters). Only
// HMAC-SHA256(AGENT_KEY_PEPPER, key) is stored (finder_workers.key_hash),
// the same pattern as the assistant keys (src/lib/agent/keys.ts).

import { createHmac, randomBytes } from "node:crypto";

export const WORKER_KEY_PREFIX = "jph_work_";
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BODY_LENGTH = 43;
const WORKER_KEY_RE = /^jph_work_[0-9A-Za-z]{43}$/;

function toBase62(bytes: Buffer): string {
  let n = BigInt("0x" + bytes.toString("hex"));
  let out = "";
  while (n > BigInt(0)) {
    out = BASE62[Number(n % BigInt(62))] + out;
    n /= BigInt(62);
  }
  return out.padStart(BODY_LENGTH, "0");
}

export function generateWorkerKey(): { key: string; prefix: string } {
  const body = toBase62(randomBytes(32));
  return { key: WORKER_KEY_PREFIX + body, prefix: body.slice(0, 8) };
}

export function looksLikeWorkerKey(key: string): boolean {
  return WORKER_KEY_RE.test(key);
}

export function hashWorkerKey(key: string, pepper: string): string {
  return createHmac("sha256", pepper).update(key).digest("hex");
}

export function bearerKey(header: string | null | undefined): string {
  const h = header ?? "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

// ------------------------------------------------------------------
// Request bodies
// ------------------------------------------------------------------

export class WorkerInputError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HTTP_RE = /^https?:\/\/[^\s"'<>]{1,490}$/i;

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function onlyKeys(o: Obj, allowed: string[], where: string) {
  const extra = Object.keys(o).filter((k) => !allowed.includes(k));
  if (extra.length) throw new WorkerInputError(`${where}: unknown field ${extra[0]}`);
}

function str(v: unknown, max: number, where: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new WorkerInputError(`${where} must be text`);
  const s = v.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  if (s.length > max) throw new WorkerInputError(`${where} is too long`);
  return s || null;
}

function httpUrl(v: unknown, where: string, required: boolean): string | null {
  const s = str(v, 500, where);
  if (!s) {
    if (required) throw new WorkerInputError(`${where} is required`);
    return null;
  }
  if (!HTTP_RE.test(s)) throw new WorkerInputError(`${where} must be an http(s) link`);
  return s;
}

export function parseClaim(body: Obj): { limit: number } {
  onlyKeys(body, ["limit"], "claim");
  const n = body.limit === undefined ? 1 : Number(body.limit);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new WorkerInputError("limit must be 1 to 5");
  return { limit: n };
}

export function parseHeartbeat(body: Obj): { item_ids: string[] } {
  onlyKeys(body, ["item_ids"], "heartbeat");
  const ids = body.item_ids;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 20 || !ids.every((x) => typeof x === "string" && UUID_RE.test(x))) {
    throw new WorkerInputError("item_ids must be 1 to 20 ids");
  }
  return { item_ids: ids as string[] };
}

export function parseLookup(body: Obj): { website: string | null; name: string | null; city: string | null } {
  onlyKeys(body, ["website", "name", "city"], "lookup");
  const website = str(body.website, 300, "website");
  const name = str(body.name, 200, "name");
  const city = str(body.city, 120, "city");
  if (!website && !name) throw new WorkerInputError("give a website or a name");
  return { website, name, city };
}

const OUTCOMES = ["found", "not_found", "ambiguous", "failed"] as const;
const LICENCES = ["own-site", "odbl", "open-gov"];
const CONTACT_KINDS = ["email", "phone", "contact_form"];
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

function checks(v: unknown): Record<string, string | number | boolean> {
  if (v === undefined || v === null) return {};
  if (!isObj(v)) throw new WorkerInputError("checks must be an object");
  const out: Record<string, string | number | boolean> = {};
  for (const [k, val] of Object.entries(v).slice(0, 12)) {
    if (!/^[a-z_]{1,20}$/.test(k)) continue;
    if (typeof val === "boolean" || typeof val === "number") out[k] = val;
    else if (typeof val === "string") out[k] = val.slice(0, 40);
  }
  return out;
}

export type Completion = {
  item_id: string;
  payload: {
    outcome: (typeof OUTCOMES)[number];
    company?: Obj;
    contacts?: Obj[];
    candidates?: Obj[];
    why?: string | null;
    note?: string | null;
  };
};

// Everything the worker may send when it finishes one item. Strict:
// unknown fields are refused, every contact needs a source link, an email
// must look like an email, and a contact form must be an http(s) link.
export function parseCompletion(body: Obj): Completion {
  onlyKeys(body, ["item_id", "outcome", "company", "contacts", "candidates", "why", "note"], "complete");
  const item_id = String(body.item_id ?? "");
  if (!UUID_RE.test(item_id)) throw new WorkerInputError("item_id is required");
  const outcome = body.outcome as (typeof OUTCOMES)[number];
  if (!OUTCOMES.includes(outcome)) throw new WorkerInputError("outcome must be found, not_found, ambiguous or failed");

  const payload: Completion["payload"] = {
    outcome,
    why: str(body.why, 500, "why"),
    note: str(body.note, 300, "note"),
  };

  if (outcome === "found") {
    if (!isObj(body.company)) throw new WorkerInputError("company is required when found");
    const c = body.company;
    onlyKeys(c, ["name", "website", "city", "region", "country", "address", "osm_ref", "osm_fields", "source_url", "licence", "no_solicitation"], "company");
    const country = str(c.country, 2, "company.country");
    const osmRef = str(c.osm_ref, 40, "company.osm_ref");
    if (osmRef && !/^(node|way|relation)\/[0-9]{1,20}$/.test(osmRef)) throw new WorkerInputError("company.osm_ref looks wrong");
    const licence = str(c.licence, 10, "company.licence") ?? "own-site";
    if (!LICENCES.includes(licence)) throw new WorkerInputError("company.licence looks wrong");
    const osmFields = Array.isArray(c.osm_fields) ? c.osm_fields.filter((x) => typeof x === "string").slice(0, 10).map((x) => String(x).slice(0, 30)) : [];
    payload.company = {
      name: str(c.name, 200, "company.name"),
      website: httpUrl(c.website, "company.website", false),
      city: str(c.city, 120, "company.city"),
      region: str(c.region, 60, "company.region"),
      country: country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null,
      address: str(c.address, 300, "company.address"),
      osm_ref: osmRef,
      osm_fields: osmFields,
      source_url: httpUrl(c.source_url, "company.source_url", true),
      licence,
      no_solicitation: c.no_solicitation === true,
    };

    if (!Array.isArray(body.contacts) || body.contacts.length === 0) {
      throw new WorkerInputError("contacts are required when found");
    }
    if (body.contacts.length > 12) throw new WorkerInputError("at most 12 contacts");
    payload.contacts = body.contacts.map((raw, i) => {
      if (!isObj(raw)) throw new WorkerInputError(`contacts[${i}] must be an object`);
      onlyKeys(raw, ["kind", "value", "source_url", "licence", "checks", "quality", "role_address", "osm_derived"], `contacts[${i}]`);
      const kind = String(raw.kind ?? "");
      if (!CONTACT_KINDS.includes(kind)) throw new WorkerInputError(`contacts[${i}].kind looks wrong`);
      const value = str(raw.value, 320, `contacts[${i}].value`);
      if (!value) throw new WorkerInputError(`contacts[${i}].value is required`);
      if (kind === "email" && !EMAIL_RE.test(value)) throw new WorkerInputError(`contacts[${i}] is not an email`);
      if (kind === "phone" && value.replace(/[^0-9]/g, "").length < 7) throw new WorkerInputError(`contacts[${i}] is not a phone number`);
      if (kind === "contact_form" && !HTTP_RE.test(value)) throw new WorkerInputError(`contacts[${i}] must be an http(s) link`);
      const licence = str(raw.licence, 10, `contacts[${i}].licence`) ?? "own-site";
      if (!LICENCES.includes(licence)) throw new WorkerInputError(`contacts[${i}].licence looks wrong`);
      const quality = raw.quality === undefined ? 50 : Number(raw.quality);
      if (!Number.isInteger(quality) || quality < 0 || quality > 100) throw new WorkerInputError(`contacts[${i}].quality must be 0 to 100`);
      return {
        kind,
        value,
        source_url: httpUrl(raw.source_url, `contacts[${i}].source_url`, true),
        licence,
        checks: checks(raw.checks),
        quality,
        role_address: raw.role_address === true,
        osm_derived: raw.osm_derived === true,
      };
    });
  }

  if (outcome === "ambiguous") {
    if (!Array.isArray(body.candidates) || body.candidates.length < 2) {
      throw new WorkerInputError("ambiguous needs at least 2 candidates");
    }
    payload.candidates = body.candidates.slice(0, 5).map((raw, i) => {
      if (!isObj(raw)) throw new WorkerInputError(`candidates[${i}] must be an object`);
      onlyKeys(raw, ["name", "city", "website", "source_url"], `candidates[${i}]`);
      const name = str(raw.name, 200, `candidates[${i}].name`);
      if (!name) throw new WorkerInputError(`candidates[${i}].name is required`);
      return {
        name,
        city: str(raw.city, 120, `candidates[${i}].city`),
        website: httpUrl(raw.website, `candidates[${i}].website`, false),
        source_url: httpUrl(raw.source_url, `candidates[${i}].source_url`, false),
      };
    });
  }

  return { item_id, payload };
}

// "Find me customers": the new businesses the worker found on the map for a
// discovery item. The database skips ones the user already has.
export type Discovered = {
  item_id: string;
  payload: {
    companies: { name: string; website: string | null; city: string | null; region: string | null; country: string | null; source_url: string }[];
    note: string | null;
  };
};

export function parseDiscovered(body: Obj): Discovered {
  onlyKeys(body, ["item_id", "companies", "note"], "discovered");
  const item_id = String(body.item_id ?? "");
  if (!UUID_RE.test(item_id)) throw new WorkerInputError("item_id looks wrong");
  const list = body.companies ?? [];
  if (!Array.isArray(list) || list.length > 150) throw new WorkerInputError("companies must be a list of up to 150");
  const companies = list.map((raw, i) => {
    if (!isObj(raw)) throw new WorkerInputError(`companies[${i}] must be an object`);
    onlyKeys(raw, ["name", "website", "city", "region", "country", "source_url", "category"], `companies[${i}]`);
    const name = str(raw.name, 200, `companies[${i}].name`);
    if (!name) throw new WorkerInputError(`companies[${i}].name is required`);
    const country = str(raw.country, 2, `companies[${i}].country`);
    if (country && !/^[A-Za-z]{2}$/.test(country)) throw new WorkerInputError(`companies[${i}].country looks wrong`);
    str(raw.category, 60, `companies[${i}].category`);
    return {
      name,
      website: httpUrl(raw.website, `companies[${i}].website`, false),
      city: str(raw.city, 120, `companies[${i}].city`),
      region: str(raw.region, 60, `companies[${i}].region`),
      country: country ? country.toUpperCase() : null,
      source_url: httpUrl(raw.source_url, `companies[${i}].source_url`, true) as string,
    };
  });
  return { item_id, payload: { companies, note: str(body.note, 300, "note") } };
}
