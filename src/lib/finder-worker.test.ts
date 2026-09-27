// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WorkerInputError,
  bearerKey,
  generateWorkerKey,
  hashWorkerKey,
  looksLikeWorkerKey,
  parseClaim,
  parseCompletion,
  parseHeartbeat,
  parseLookup,
} from "./finder-worker.ts";

const ITEM = "0f0e0d0c-0b0a-4908-8706-050403020100";
const PEPPER = "p".repeat(40);

test("worker keys: format, prefix, peppered hash", () => {
  const { key, prefix } = generateWorkerKey();
  assert.match(key, /^jph_work_[0-9A-Za-z]{43}$/);
  assert.equal(prefix, key.slice(9, 17));
  assert.ok(looksLikeWorkerKey(key));
  assert.ok(!looksLikeWorkerKey("jph_live_" + key.slice(9)), "an assistant key is not a worker key");
  assert.ok(!looksLikeWorkerKey(key + "x"));
  const h = hashWorkerKey(key, PEPPER);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.notEqual(h, hashWorkerKey(key, "q".repeat(40)), "the pepper matters");
  assert.notEqual(generateWorkerKey().key, key);
});

test("bearer header", () => {
  assert.equal(bearerKey("Bearer abc "), "abc");
  assert.equal(bearerKey("Basic abc"), "");
  assert.equal(bearerKey(null), "");
});

test("claim, heartbeat and lookup bodies are strict", () => {
  assert.deepEqual(parseClaim({}), { limit: 1 });
  assert.deepEqual(parseClaim({ limit: 5 }), { limit: 5 });
  assert.throws(() => parseClaim({ limit: 6 }), WorkerInputError);
  assert.throws(() => parseClaim({ limit: 1, all: true }), /unknown field all/);
  assert.deepEqual(parseHeartbeat({ item_ids: [ITEM] }), { item_ids: [ITEM] });
  assert.throws(() => parseHeartbeat({ item_ids: [] }), WorkerInputError);
  assert.throws(() => parseHeartbeat({ item_ids: ["1; drop table"] }), WorkerInputError);
  assert.deepEqual(parseLookup({ website: "acme.ca" }), { website: "acme.ca", name: null, city: null });
  assert.throws(() => parseLookup({ city: "Toronto" }), WorkerInputError);
});

const found = {
  item_id: ITEM,
  outcome: "found",
  company: { name: "Acme", website: "https://acme.ca", city: "Toronto", country: "ca", source_url: "https://acme.ca/" },
  contacts: [
    { kind: "phone", value: "416-555-0100", source_url: "https://acme.ca/contact", checks: { valid: true, region: "CA", evil: { x: 1 } } },
    { kind: "email", value: "info@acme.ca", source_url: "https://acme.ca/contact", role_address: true, quality: 80 },
    { kind: "contact_form", value: "https://acme.ca/contact", source_url: "https://acme.ca/contact" },
  ],
  why: "Plumber in Toronto",
};

test("completion: a good 'found' passes and is cleaned", () => {
  const c = parseCompletion(structuredClone(found));
  assert.equal(c.item_id, ITEM);
  assert.equal(c.payload.company?.country, "CA");
  assert.equal(c.payload.contacts?.length, 3);
  assert.deepEqual(c.payload.contacts?.[0].checks, { valid: true, region: "CA" }, "nested values dropped");
  assert.equal(c.payload.contacts?.[1].role_address, true);
  assert.equal(c.payload.contacts?.[2].licence, "own-site");
});

test("completion: every contact needs a source link and a sane value", () => {
  const noSource = structuredClone(found);
  delete (noSource.contacts[0] as { source_url?: string }).source_url;
  assert.throws(() => parseCompletion(noSource), /source_url is required/);

  const badEmail = structuredClone(found);
  badEmail.contacts[1].value = "not-an-email";
  assert.throws(() => parseCompletion(badEmail), /not an email/);

  const jsForm = structuredClone(found);
  jsForm.contacts[2].value = "javascript:alert(1)";
  assert.throws(() => parseCompletion(jsForm), /http\(s\) link/);

  const extra = structuredClone(found) as Record<string, unknown>;
  extra.user_email = "x@y.z";
  assert.throws(() => parseCompletion(extra), /unknown field user_email/);

  const noCompanySource = structuredClone(found);
  noCompanySource.company.source_url = "";
  assert.throws(() => parseCompletion(noCompanySource), /company.source_url is required/);

  const tooMany = structuredClone(found);
  tooMany.contacts = Array.from({ length: 13 }, () => found.contacts[0]);
  assert.throws(() => parseCompletion(tooMany), /at most 12/);
});

test("completion: not found, failed and ambiguous", () => {
  assert.equal(parseCompletion({ item_id: ITEM, outcome: "not_found", note: "no website" }).payload.note, "no website");
  assert.equal(parseCompletion({ item_id: ITEM, outcome: "failed" }).payload.outcome, "failed");
  assert.throws(() => parseCompletion({ item_id: ITEM, outcome: "maybe" }), WorkerInputError);
  assert.throws(() => parseCompletion({ item_id: "x", outcome: "failed" }), /item_id/);
  assert.throws(() => parseCompletion({ item_id: ITEM, outcome: "ambiguous", candidates: [{ name: "A" }] }), /at least 2/);
  const amb = parseCompletion({
    item_id: ITEM,
    outcome: "ambiguous",
    candidates: [{ name: "A", website: "https://a.ca" }, { name: "B", city: "Ottawa" }],
  });
  assert.equal(amb.payload.candidates?.length, 2);
  assert.throws(
    () => parseCompletion({ item_id: ITEM, outcome: "ambiguous", candidates: [{ name: "A", website: "ftp://a" }, { name: "B" }] }),
    /http\(s\) link/
  );
});
