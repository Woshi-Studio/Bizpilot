// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyHide, buildHaveIndex, haveLabel, matchHave } from "./finder-suppress.ts";

const idx = buildHaveIndex(
  [
    { id: "L1", name: "Sam", company: "Treehaus Inc", email: "sam@gmail.com", website: null, address: "12 King St, Kitchener ON" },
    { id: "L2", name: "Kitchener Public Library", email: "info@kpl.org" },
    { id: "L3", name: "Joe's Diner", address: "Waterloo" },
  ],
  [{ id: "C1", name: "Mia", company: "Bright Dental", website: "https://www.brightdental.example/about" }]
);

type T = { company_name: string; email: string | null; website: string | null; city: string | null; lead_id?: string | null };
const r = (o: Partial<T>): T => ({ company_name: "Nobody Co", email: null, website: null, city: null, ...o });

test("match by email first", () => {
  assert.deepEqual(matchHave(idx, r({ company_name: "KPL", email: "INFO@kpl.org" })), { kind: "lead", id: "L2", by: "email" });
});

test("then by website domain (and business email domain)", () => {
  assert.deepEqual(matchHave(idx, r({ website: "http://brightdental.example" })), { kind: "customer", id: "C1", by: "domain" });
  assert.deepEqual(matchHave(idx, r({ email: "front@brightdental.example" })), { kind: "customer", id: "C1", by: "domain" });
  assert.deepEqual(matchHave(idx, r({ website: "https://kpl.org/branches" })), { kind: "lead", id: "L2", by: "domain" });
});

test("webmail domains never match by domain", () => {
  assert.equal(matchHave(idx, r({ email: "other@gmail.com" })), null);
});

test("then by normalised name + city", () => {
  assert.deepEqual(matchHave(idx, r({ company_name: "The Treehaus Ltd.", city: "Kitchener" })), { kind: "lead", id: "L1", by: "name" });
  // Same name, other city (the record's address says Waterloo)
  assert.equal(matchHave(idx, r({ company_name: "Joe's Diner", city: "Toronto" })), null);
  assert.equal(matchHave(idx, r({ company_name: "Joes Diner", city: "Waterloo" }))?.id, "L3");
  // No city on the result: the name alone
  assert.equal(matchHave(idx, r({ company_name: "Joe's Diner" }))?.id, "L3");
});

test("no match", () => {
  assert.equal(matchHave(idx, r({ company_name: "Brand New Co", city: "Guelph", website: "new.example" })), null);
});

test("labels", () => {
  assert.equal(haveLabel({ kind: "customer", id: "C1", by: "domain" }), "Already a customer (same website)");
  assert.equal(haveLabel({ kind: "lead", id: "L1", by: "email" }), "Already in your leads (same email)");
  assert.equal(haveLabel({ kind: "lead", id: "L1", by: "added" }), "In your leads");
});

test("hide toggle", () => {
  const rows = [
    { id: "a", ...r({ email: "info@kpl.org" }) },
    { id: "b", ...r({ company_name: "Fresh Co" }) },
    { id: "c", ...r({ company_name: "Added Co", lead_id: "L9" }) },
  ];
  const all = applyHide(rows, idx, false);
  assert.equal(all.shown.length, 3);
  assert.equal(all.hidden, 0);
  assert.equal(all.shown[0].have?.id, "L2");
  assert.equal(all.shown[2].have?.by, "added");
  const hidden = applyHide(rows, idx, true);
  assert.deepEqual(hidden.shown.map((x) => x.id), ["b"]);
  assert.equal(hidden.hidden, 2);
});
