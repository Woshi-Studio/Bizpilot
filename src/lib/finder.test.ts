// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  spendAccess,
  AUP_VERSION,
  betaCredits,
  daysAgoText,
  sortResults,
  emailCheckText,
  finderAccess,
  finderErrorKey,
  finderErrorMessage,
  freshness,
  normCompany,
  normDomain,
  normPhone,
  outreachTemplate,
  parseIntake,
  parseRemoval,
  kmToMiles,
  milesToKm,
  submitMode,
  phoneCheckText,
  safeHttpUrl,
  telHref,
  visibleResult,
  type FinderResult,
} from "./finder.ts";

function fields(obj: Record<string, string | string[]>) {
  return {
    get: (k: string) => {
      const v = obj[k];
      return Array.isArray(v) ? v[0] ?? null : v ?? null;
    },
    getAll: (k: string) => {
      const v = obj[k];
      return v === undefined ? [] : Array.isArray(v) ? v : [v];
    },
  };
}

const OWNER = "11111111-1111-4111-8111-111111111111";
const BETA = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

test("access: owner, invited tester, and nobody else while the Finder is closed", () => {
  const env = { OWNER_BUSINESS_IDS: ` ${OWNER.toUpperCase()} , x`, FINDER_BETA_BUSINESS_IDS: `${BETA}` };
  assert.equal(finderAccess(OWNER, env, "free"), "owner");
  assert.equal(finderAccess(BETA, env, "free"), "full");
  assert.equal(finderAccess(OTHER, env, "pro"), "none", "closed: even Boss waits");
  assert.equal(finderAccess("", env), "none");
  assert.equal(finderAccess(BETA, {}), "none", "no env = nobody");
  // The owner list wins over the beta list
  assert.equal(finderAccess(OWNER, { OWNER_BUSINESS_IDS: OWNER, FINDER_BETA_BUSINESS_IDS: OWNER }), "owner");
});

test("access when open: Starter and Hustle get locked results, Boss unlocked, owner unlimited", () => {
  const env = { OWNER_BUSINESS_IDS: OWNER, FINDER_OPEN: "1" };
  assert.equal(finderAccess(OTHER, env, "free"), "locked", "Starter");
  assert.equal(finderAccess(OTHER, env, "premium"), "locked", "Hustle");
  assert.equal(finderAccess(OTHER, env, "pro"), "full", "Boss");
  assert.equal(finderAccess(OTHER, env, null), "locked", "unknown plan = Starter");
  assert.equal(finderAccess(OWNER, env, "free"), "owner", "owner stays unlimited on any plan");
  assert.equal(submitMode(finderAccess(OTHER, env, "free")), "locked");
  assert.equal(submitMode(finderAccess(OTHER, env, "pro")), "full");
  assert.equal(submitMode("none"), null);
  assert.equal(finderAccess(OTHER, { FINDER_OPEN: "no" }, "pro"), "none");
});

test("beta credits: default 10, only 1..100", () => {
  assert.equal(betaCredits({}), 10);
  assert.equal(betaCredits({ FINDER_BETA_CREDITS: "25" }), 25);
  assert.equal(betaCredits({ FINDER_BETA_CREDITS: "0" }), 10);
  assert.equal(betaCredits({ FINDER_BETA_CREDITS: "5000" }), 10);
  assert.equal(betaCredits({ FINDER_BETA_CREDITS: "abc" }), 10);
});

test("normalising matches the database rules", () => {
  assert.equal(normCompany("The Acme & Sons, Inc."), "acmeandsons");
  assert.equal(normCompany("Bolt Café Ltd"), "boltcaf");
  assert.equal(normDomain("HTTPS://www.Acme.example:8080/x?y"), "acme.example");
  assert.equal(normDomain("acme.example/about"), "acme.example");
  assert.equal(normDomain(""), null);
  assert.equal(normPhone("+1 (416) 555-0100"), "4165550100");
  assert.equal(normPhone("020 7946 0000"), "02079460000");
  assert.equal(normPhone("n/a"), null);
});

test("intake needs the business, the offer and the Acceptable Use tick", () => {
  const base = { my_business: "Web studio", offer: "Websites for cafés" };
  assert.equal(parseIntake(fields(base)).ok, false, "no tick");
  const ok = parseIntake(
    fields({
      ...base,
      aup: "yes",
      industries: ["fitness", "offices", "hacking"],
      industry_other: "  dental labs ",
      company_sizes: ["2-10", "huge"],
      needs: ["email", "phone", "spam"],
      radius_mi: "50",
      area: "caus",
      target: "  cafés   near me ",
    })
  );
  assert.ok(ok.ok);
  if (!ok.ok) return;
  assert.deepEqual(ok.value.industries, ["fitness", "offices"]);
  assert.equal(ok.value.industry_other, "dental labs");
  assert.deepEqual(ok.value.company_sizes, ["2-10"]);
  assert.deepEqual(ok.value.needs, ["email", "phone"]);
  assert.equal(ok.value.radius_km, 80, "50 miles stored as 80 km");
  assert.equal(ok.value.area, "CAUS");
  assert.equal(ok.value.country, null, "Canada + USA sets no single country");
  assert.equal(ok.value.target, "cafés near me");
  assert.equal(ok.value.aup_version, AUP_VERSION);
  const odd = parseIntake(fields({ ...base, aup: "yes", radius_mi: "7", area: "EU" }));
  assert.ok(odd.ok && odd.value.radius_km === null, "N/A = whole area");
  assert.ok(odd.ok && odd.value.area === "CA" && odd.value.country === "CA", "unknown area = Canada");
  const us = parseIntake(fields({ ...base, aup: "yes", radius_mi: "200", area: "US" }));
  assert.ok(us.ok && us.value.country === "US" && us.value.radius_km === 322);
  assert.ok(odd.ok && odd.value.needs.join() === "phone,website", "default needs");
  assert.equal(parseIntake(fields({ offer: "x", aup: "yes" })).ok, false);
});

test("radius: miles in the form, km in the database", () => {
  assert.equal(milesToKm("15"), 24);
  assert.equal(milesToKm(50), 80);
  assert.equal(milesToKm("200"), 322);
  assert.equal(milesToKm(""), null);
  assert.equal(milesToKm("7"), null);
  assert.equal(kmToMiles(80), 50);
  assert.equal(kmToMiles(15), 15, "old 15 km rows show as 15 miles, the closest");
  assert.equal(kmToMiles(null), null);
});

test("database errors become plain words", () => {
  assert.equal(finderErrorKey('ERROR: finder:no_credits'), "no_credits");
  assert.match(finderErrorMessage("finder:no_credits"), /out of lead credits/);
  assert.match(finderErrorMessage("finder:upgrade"), /Get lead credits/);
  assert.match(finderErrorMessage("finder:locked_cap"), /free searches/);
  assert.equal(finderErrorKey("finder:unknown_thing"), null);
  assert.match(finderErrorMessage("boom"), /try again/);
});

test("last-checked badge: amber at 90 days, grey at 180", () => {
  const now = Date.parse("2026-09-27T00:00:00Z");
  const ago = (d: number) => new Date(now - d * 86_400_000).toISOString();
  assert.equal(freshness(ago(10), now), "fresh");
  assert.equal(freshness(ago(89), now), "fresh");
  assert.equal(freshness(ago(90), now), "amber");
  assert.equal(freshness(ago(180), now), "grey");
  assert.equal(freshness(null, now), "grey");
});

test("check text never promises delivery", () => {
  const e = emailCheckText({ format: true, mx: true, on_site: "2026-09-27", role: true });
  assert.match(e, /Checked: format, mail server, still on their website \(2026-09-27\)/);
  assert.match(e, /shared inbox/);
  assert.doesNotMatch(e, /verified|deliverable|guarantee/i);
  assert.equal(emailCheckText(null), "Not checked yet.");
  assert.match(phoneCheckText({ valid: true, region: "CA", on_site: "2026-09-27" }), /valid CA number format, listed on their website/);
});

test("first-email template identifies the sender and offers an opt-out", () => {
  const t = outreachTemplate({ company: "Acme", website: "https://acme.ca", senderName: "Maya", senderBusiness: "Bright Harbor", offer: "I build booking pages." });
  assert.match(t.subject, /Acme/);
  assert.match(t.body, /I'm Maya from Bright Harbor\. I build booking pages\./);
  assert.match(t.body, /no thanks/);
  assert.match(t.body, /\[your mailing address\]/);
  const t2 = outreachTemplate({ company: "Acme", website: null, senderName: null, senderBusiness: "B", offer: null });
  assert.match(t2.body, /\[your name\]/);
});

test("a locked result shows only the name, place and why (Starter / Hustle)", () => {
  const r: FinderResult = {
    id: "r", company_name: "Acme", website: "https://acme.ca", city: null, region: null, country: null, address: null,
    phone: "416", phone_checks: { valid: true }, email: "a@acme.ca", email_checks: {}, contact_form_url: "https://acme.ca/c",
    source_urls: ["https://acme.ca/contact"], why: "Plumber", locked: true, contact_name: "Jane Doe", last_checked_at: "2026-09-01", lead_id: null, created_at: "2026-09-01",
  };
  const v = visibleResult(r);
  assert.equal(v.phone, null);
  assert.equal(v.email, null);
  assert.equal(v.contact_form_url, null);
  assert.equal(v.website, null, "website hidden");
  assert.equal(v.address, null);
  assert.deepEqual(v.source_urls, [], "source hidden");
  assert.equal(v.contact_name, null, "contact name hidden");
  assert.equal(v.company_name, "Acme");
  assert.equal(v.why, "Plumber");
  const open = visibleResult({ ...r, locked: false, contact_name: "Jane Doe" });
  assert.equal(open.phone, "416", "Boss: unlocked");
  assert.equal(open.website, "https://acme.ca");
  assert.equal(open.contact_name, "Jane Doe");
});

test("remove-my-data form: bot guards, confirm tick, sane fields", () => {
  const now = 1_000_000;
  const good = { email: " Owner@Acme.CA ", company: "Acme", website: "acme.ca", phone: "416 555 0100", confirm: true, shown_at: now - 10_000 };
  const r = parseRemoval(good, now);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value.email, "owner@acme.ca");
  assert.deepEqual(parseRemoval({ ...good, website_confirm: "x" }, now), { ok: false, error: "bot" });
  assert.deepEqual(parseRemoval({ ...good, shown_at: now - 500 }, now), { ok: false, error: "bot" });
  assert.equal(parseRemoval({ ...good, confirm: false }, now).ok, false);
  assert.equal(parseRemoval({ ...good, email: "nope" }, now).ok, false);
  assert.equal(parseRemoval({ ...good, website: "javascript:x" }, now).ok, false);
  assert.equal(parseRemoval({ ...good, phone: "12" }, now).ok, false);
});

test("only http(s) links and real phone numbers become links", () => {
  assert.equal(safeHttpUrl("https://acme.ca/contact"), "https://acme.ca/contact");
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpUrl("https://acme.ca/\"onmouseover=x"), null);
  assert.equal(telHref("+1 (416) 555-0100"), "tel:+14165550100");
  assert.equal(telHref("n/a"), null);
});

test("found X days ago", () => {
  const now = Date.parse("2026-09-29T12:00:00Z");
  assert.equal(daysAgoText("2026-09-29T01:00:00Z", now), "today");
  assert.equal(daysAgoText("2026-09-28T11:00:00Z", now), "1 day ago");
  assert.equal(daysAgoText("2026-09-17T12:00:00Z", now), "12 days ago");
  assert.equal(daysAgoText(null, now), "date unknown");
  assert.equal(daysAgoText("2026-10-01T00:00:00Z", now), "today");
});

test("results: most recently found or checked first", () => {
  const rows = [
    { id: "old", created_at: "2026-09-01T00:00:00Z", last_checked_at: "2026-09-01T00:00:00Z" },
    { id: "rechecked", created_at: "2026-09-02T00:00:00Z", last_checked_at: "2026-09-28T00:00:00Z" },
    { id: "new-old-data", created_at: "2026-09-27T00:00:00Z", last_checked_at: "2026-03-01T00:00:00Z" },
  ];
  assert.deepEqual(sortResults(rows).map((r) => r.id), ["rechecked", "new-old-data", "old"]);
  assert.deepEqual(sortResults(rows, "fresh").map((r) => r.id), ["rechecked", "old", "new-old-data"]);
  assert.equal(rows[0].id, "old", "does not sort in place");
});

test("Starter / Hustle with lead credits search like Boss; none = locked", () => {
  assert.equal(spendAccess("locked", 5), "full");
  assert.equal(spendAccess("locked", 1), "full");
  assert.equal(spendAccess("locked", 0), "locked");
  assert.equal(spendAccess("locked", -1), "locked");
  assert.equal(spendAccess("locked", NaN), "locked");
  assert.equal(spendAccess("full", 0), "full", "Boss out of credits stays Boss");
  assert.equal(spendAccess("owner", 0), "owner");
  assert.equal(spendAccess("none", 50), "none", "credits never open a closed Lead Finder");
});
