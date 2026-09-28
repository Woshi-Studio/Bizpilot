// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { chipText, detectQuery, isFreeMail, parseSmartSearch } from "./finder-query.ts";

const form = (obj: Record<string, string>) => ({ get: (k: string) => obj[k] ?? null });

test("detect: the 5 kinds of input", () => {
  assert.equal(detectQuery("Acme Plumbing")?.kind, "name");
  assert.equal(detectQuery("acmeplumbing.ca")?.kind, "domain");
  assert.equal(detectQuery("https://www.AcmePlumbing.ca/contact")?.value, "acmeplumbing.ca");
  assert.equal(detectQuery("info@AcmePlumbing.ca")?.kind, "email");
  assert.equal(detectQuery("info@AcmePlumbing.ca")?.domain, "acmeplumbing.ca");
  const phone = detectQuery("(416) 555-0100");
  assert.equal(phone?.kind, "phone");
  assert.equal(phone?.value, "4165550100", "stored like finder_norm_phone");
  assert.equal(detectQuery("+1 416 555 0100")?.value, "4165550100");
  assert.equal(detectQuery("+44 20 7946 0000")?.value, "442079460000");
  assert.equal(detectQuery("416-555-0100 ext 12")?.kind, "phone");
  assert.equal(detectQuery("Jane Doe")?.kind, "name", "a person's name is a name until the user says so");
});

test("detect: tricky names stay names", () => {
  assert.equal(detectQuery("7-Eleven")?.kind, "name");
  assert.equal(detectQuery("St. John's Bakery")?.kind, "name");
  assert.equal(detectQuery("Studio 54")?.kind, "name");
  assert.equal(detectQuery("2024")?.kind, "name", "4 digits is not a phone");
  assert.equal(detectQuery("   "), null);
});

test("chips say what we think it is", () => {
  assert.match(chipText(detectQuery("info@acme.ca"), false)!, /Looks like an email/);
  assert.match(chipText(detectQuery("acme.ca"), false)!, /Looks like a website/);
  assert.match(chipText(detectQuery("416 555 0100"), false)!, /Looks like a phone number/);
  assert.match(chipText(detectQuery("Acme"), false)!, /company name/);
  assert.match(chipText(detectQuery("Jane Doe"), true)!, /A person at a company/);
  assert.match(chipText(detectQuery("jane@gmail.com"), false)!, /personal email/);
});

test("smart search: company name, city optional", () => {
  const r = parseSmartSearch(form({ q: "  Acme   Plumbing " }));
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.kind, "company");
    assert.equal(r.value.company, "Acme Plumbing");
    assert.equal(r.value.city, null);
  }
  const c = parseSmartSearch(form({ q: "Acme", city: "Toronto" }));
  assert.ok(c.ok && c.value.city === "Toronto");
});

test("smart search: website and business email go to the domain", () => {
  const w = parseSmartSearch(form({ q: "https://www.acme.ca/about" }));
  assert.ok(w.ok && w.value.kind === "domain" && w.value.website === "acme.ca" && w.value.company === "acme.ca");
  const e = parseSmartSearch(form({ q: "Sales@Acme.ca" }));
  assert.ok(e.ok && e.value.kind === "email" && e.value.website === "acme.ca" && e.value.email === "sales@acme.ca");
});

test("smart search: personal email addresses are refused", () => {
  assert.ok(isFreeMail("gmail.com"));
  const r = parseSmartSearch(form({ q: "someone@gmail.com" }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /personal email/);
});

test("smart search: phone", () => {
  const r = parseSmartSearch(form({ q: "905.555.0199", city: "Oakville" }));
  assert.ok(r.ok && r.value.kind === "phone" && r.value.phone === "9055550199" && r.value.city === "Oakville");
});

test("smart search: a person only at a company (business contacts only)", () => {
  const noCompany = parseSmartSearch(form({ q: "Jane Doe", as_person: "1" }));
  assert.equal(noCompany.ok, false, "a person needs their company");
  if (!noCompany.ok) assert.match(noCompany.error, /company they work at/);
  const oneWord = parseSmartSearch(form({ q: "Jane", as_person: "1", person_company: "Acme" }));
  assert.equal(oneWord.ok, false, "first and last name");
  const ok = parseSmartSearch(form({ q: "Jane Doe", as_person: "1", person_company: "Acme Plumbing", city: "Toronto" }));
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.value.kind, "person");
    assert.equal(ok.value.person, "Jane Doe");
    assert.equal(ok.value.company, "Acme Plumbing");
    assert.equal(ok.value.website, null);
  }
  const site = parseSmartSearch(form({ q: "Élise O'Neil-Tremblay", as_person: "1", person_company: "acme.ca" }));
  assert.ok(site.ok && site.value.website === "acme.ca" && site.value.person === "Élise O'Neil-Tremblay");
  // "as_person" on an email or phone is ignored: those aren't names
  const e = parseSmartSearch(form({ q: "info@acme.ca", as_person: "1" }));
  assert.ok(e.ok && e.value.kind === "email");
});

test("smart search: empty or junk", () => {
  assert.equal(parseSmartSearch(form({ q: "" })).ok, false);
  assert.equal(parseSmartSearch(form({ q: "x".repeat(250) })).ok, false);
});
