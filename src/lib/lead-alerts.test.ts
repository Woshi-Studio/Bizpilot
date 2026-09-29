// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LEAD_ALERT_MODE,
  DIGEST_MAX_LINES,
  LEAD_ALERT_MODES,
  alertMode,
  buildDigest,
  digestDue,
  digestSince,
  modeAfterUnsubscribe,
  seenSince,
  unsubToken,
  unsubValid,
  wantsApp,
  wantsEmail,
} from "./lead-alerts.ts";

const NOW = Date.parse("2026-09-29T12:00:00Z");
const H = 3_600_000;

test("four choices; Email + App by default", () => {
  assert.deepEqual(LEAD_ALERT_MODES.map((m) => m.label), ["Email + App", "Email only", "App only", "Off"]);
  assert.equal(DEFAULT_LEAD_ALERT_MODE, "both");
  assert.equal(alertMode(null), "both");
  assert.equal(alertMode({ lead_alerts: "junk" }), "both");
  assert.equal(alertMode({ lead_alerts: "app" }), "app");
  assert.deepEqual(["both", "email", "app", "off"].map((m) => [wantsEmail(m as never), wantsApp(m as never)]), [
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ]);
});

test("at most one email a day", () => {
  assert.equal(digestDue(null, NOW), true);
  assert.equal(digestDue(new Date(NOW - 2 * H).toISOString(), NOW), false);
  assert.equal(digestDue(new Date(NOW - 21 * H).toISOString(), NOW), true);
});

test("what counts as new", () => {
  const seen = new Date(NOW - 3 * H).toISOString();
  const last = new Date(NOW - 30 * H).toISOString();
  assert.equal(digestSince(last, seen, NOW), seen, "already seen in the app: not emailed");
  assert.equal(digestSince(null, null, NOW), new Date(NOW - 7 * 24 * H).toISOString(), "a week back at most");
  assert.equal(seenSince({ lead_alerts_seen_at: seen }, NOW), seen);
  assert.equal(seenSince({}, NOW), new Date(NOW - 7 * 24 * H).toISOString());
});

test("the digest: company and place only, capped, with an unsubscribe link", () => {
  const results = Array.from({ length: DIGEST_MAX_LINES + 3 }, (_, i) => ({ company_name: `Co ${i}`, city: i ? "Kitchener" : null, region: "ON" }));
  const d = buildDigest({ businessName: "Woshi", results, siteUrl: "https://app.example/", unsubscribeUrl: "https://app.example/u" });
  assert.equal(d.subject, `${DIGEST_MAX_LINES + 3} new leads found for you`);
  assert.match(d.text, /- Co 0 \(ON\)/);
  assert.match(d.text, /- Co 1 \(Kitchener, ON\)/);
  assert.match(d.text, /and 3 more/);
  assert.match(d.text, /https:\/\/app\.example\/leads\/search#results/);
  assert.match(d.text, /Stop these emails: https:\/\/app\.example\/u/);
  assert.doesNotMatch(d.text, /@|tel:/, "no contact details in email");
  assert.equal(buildDigest({ businessName: "W", results: results.slice(0, 1), siteUrl: "x", unsubscribeUrl: "y" }).subject, "1 new lead found for you");
});

test("signed unsubscribe link", () => {
  const u = "3f2a9c1e-7b4d-4e8f-9a0b-1c2d3e4f5a6b";
  const t = unsubToken(u, "secret-1");
  assert.equal(unsubValid(u, t, "secret-1"), true);
  assert.equal(unsubValid(u, t, "secret-2"), false);
  assert.equal(unsubValid("00000000-0000-4000-8000-000000000001", t, "secret-1"), false);
  assert.equal(unsubValid(u, "", "secret-1"), false);
  assert.equal(unsubValid(u, t, ""), false);
});

test("unsubscribe turns email off, keeps the bell", () => {
  assert.equal(modeAfterUnsubscribe("both"), "app");
  assert.equal(modeAfterUnsubscribe("email"), "off");
  assert.equal(modeAfterUnsubscribe("app"), "app");
  assert.equal(modeAfterUnsubscribe("off"), "off");
});
