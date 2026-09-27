// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUP_VERSION,
  betaCredits,
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
  parseSearch,
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

test("access: owner, invited tester, everyone else", () => {
  const env = { OWNER_BUSINESS_IDS: ` ${OWNER.toUpperCase()} , x`, FINDER_BETA_BUSINESS_IDS: `${BETA}` };
  assert.equal(finderAccess(OWNER, env), "owner");
  assert.equal(finderAccess(BETA, env), "beta");
  assert.equal(finderAccess(OTHER, env), "none");
  assert.equal(finderAccess("", env), "none");
  assert.equal(finderAccess(BETA, {}), "none", "no env = nobody");
  // The owner list wins over the beta list
  assert.equal(finderAccess(OWNER, { OWNER_BUSINESS_IDS: OWNER, FINDER_BETA_BUSINESS_IDS: OWNER }), "owner");
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
      industries: ["Fitness", "Hacking"],
      company_sizes: ["2-10", "huge"],
      needs: ["email", "phone", "spam"],
      radius_km: "15",
      country: "ca",
      target: "  cafés   near me ",
    })
  );
  assert.ok(ok.ok);
  if (!ok.ok) return;
  assert.deepEqual(ok.value.industries, ["Fitness"]);
  assert.deepEqual(ok.value.company_sizes, ["2-10"]);
  assert.deepEqual(ok.value.needs, ["email", "phone"]);
  assert.equal(ok.value.radius_km, 15);
  assert.equal(ok.value.country, "CA");
  assert.equal(ok.value.target, "cafés near me");
  assert.equal(ok.value.aup_version, AUP_VERSION);
  const odd = parseIntake(fields({ ...base, aup: "yes", radius_km: "7", country: "ZZ" }));
  assert.ok(odd.ok && odd.value.radius_km === null && odd.value.country === null);
  assert.ok(odd.ok && odd.value.needs.join() === "phone,website", "default needs");
  assert.equal(parseIntake(fields({ offer: "x", aup: "yes" })).ok, false);
});

test("search needs a name plus a city or a website", () => {
  assert.equal(parseSearch(fields({ company: "Acme" })).ok, false);
  assert.equal(parseSearch(fields({ city: "Toronto" })).ok, false);
  assert.ok(parseSearch(fields({ company: "Acme", city: "Toronto" })).ok);
  assert.ok(parseSearch(fields({ company: "Acme", website: "acme.ca" })).ok);
  assert.ok(parseSearch(fields({ company: "Acme", website: "https://www.acme.ca/contact" })).ok);
  assert.equal(parseSearch(fields({ company: "Acme", website: "javascript:alert(1)" })).ok, false);
  assert.equal(parseSearch(fields({ company: "Acme", website: "not a site" })).ok, false);
});

test("database errors become plain words", () => {
  assert.equal(finderErrorKey('ERROR: finder:no_credits'), "no_credits");
  assert.match(finderErrorMessage("finder:no_credits"), /out of Finder credits/);
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

test("a locked result shows no contact values", () => {
  const r: FinderResult = {
    id: "r", company_name: "Acme", website: "https://acme.ca", city: null, region: null, country: null, address: null,
    phone: "416", phone_checks: { valid: true }, email: "a@acme.ca", email_checks: {}, contact_form_url: "https://acme.ca/c",
    source_urls: [], why: null, locked: true, last_checked_at: "2026-09-01", lead_id: null, created_at: "2026-09-01",
  };
  const v = visibleResult(r);
  assert.equal(v.phone, null);
  assert.equal(v.email, null);
  assert.equal(v.contact_form_url, null);
  assert.equal(v.website, "https://acme.ca");
  assert.equal(visibleResult({ ...r, locked: false }).phone, "416");
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
