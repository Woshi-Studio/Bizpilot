// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEmail, emailDomainIfValid, fairReasonText, isBadEmail, needsFairCheck, type ResolveMx } from "./fair-credit.ts";

const dnsErr = (code: string) => Object.assign(new Error(code), { code });
const fakeDns: ResolveMx = async (d) => {
  if (d === "good.example") return [{ exchange: "mx.good.example", priority: 10 }];
  if (d === "nullmx.example") return [{ exchange: "", priority: 0 }];
  if (d === "empty.example") return [];
  if (d === "nodata.example") throw dnsErr("ENODATA");
  if (d === "slow.example") throw dnsErr("ETIMEOUT");
  if (d === "servfail.example") throw dnsErr("ESERVFAIL");
  throw dnsErr("ENOTFOUND");
};

test("email format", () => {
  assert.equal(emailDomainIfValid("Hello@Good.Example"), "good.example");
  assert.equal(emailDomainIfValid("a.b+c@sub.good.example"), "sub.good.example");
  const bad = ["", "no-at", "@good.example", "a@@good.example", "a@good", "a@good.c0m", "a..b@good.example", ".a@good.example", "a b@good.example", "a@-good.example", null];
  for (const b of bad) assert.equal(emailDomainIfValid(b), null, String(b));
});

test("mail server check", async () => {
  assert.deepEqual(await checkEmail("hi@good.example", fakeDns), { verdict: "ok" });
  assert.deepEqual(await checkEmail("hi@nope.example", fakeDns), { verdict: "bad", reason: "no_domain" });
  assert.deepEqual(await checkEmail("hi@nodata.example", fakeDns), { verdict: "bad", reason: "no_mx" });
  assert.deepEqual(await checkEmail("hi@empty.example", fakeDns), { verdict: "bad", reason: "no_mx" });
  assert.deepEqual(await checkEmail("hi@nullmx.example", fakeDns), { verdict: "bad", reason: "null_mx" });
  assert.deepEqual(await checkEmail("not an email", fakeDns), { verdict: "bad", reason: "syntax" });
});

test("a DNS hiccup never refunds", async () => {
  assert.deepEqual(await checkEmail("hi@slow.example", fakeDns), { verdict: "unknown" });
  assert.deepEqual(await checkEmail("hi@servfail.example", fakeDns), { verdict: "unknown" });
});

test("which results get checked", () => {
  const now = Date.parse("2026-09-29T00:00:00Z");
  const base = { id: "r1", email: "a@good.example", locked: false, created_at: "2026-09-28T00:00:00Z", email_checks: { mx: true } };
  const charged = new Set(["r1"]);
  const none = new Set<string>();
  assert.equal(needsFairCheck(base, charged, none, now), true);
  assert.equal(needsFairCheck(base, new Set(), none, now), false, "not paid for (owner, free unlock)");
  assert.equal(needsFairCheck(base, charged, new Set(["r1"]), now), false, "already reported or refunded");
  assert.equal(needsFairCheck({ ...base, locked: true }, charged, none, now), false);
  assert.equal(needsFairCheck({ ...base, email: null }, charged, none, now), false);
  assert.equal(needsFairCheck({ ...base, email_checks: { fair: "ok" } }, charged, none, now), false);
  assert.equal(needsFairCheck({ ...base, email_checks: { fair: "bad" } }, charged, none, now), false);
  assert.equal(needsFairCheck({ ...base, created_at: "2026-08-01T00:00:00Z" }, charged, none, now), false, "older than 30 days");
});

test("labels", () => {
  assert.equal(isBadEmail({ fair: "bad" }), true);
  assert.equal(isBadEmail({ fair: "ok" }), false);
  assert.equal(isBadEmail(null), false);
  assert.match(fairReasonText("no_mx"), /no mail server/);
});
