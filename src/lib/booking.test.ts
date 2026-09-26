// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookableTypes,
  bookingLinkLimit,
  depositAllowed,
  isGoogleIcalUrl,
  maskIcalUrl,
  parseMeetingType,
  parseSettings,
  parseVisitor,
  slugify,
  SLUG_RE,
} from "./booking.ts";
import { BOOKING_STRINGS, bt } from "./booking-i18n.ts";
import { defaultWeekly } from "./booking-time.ts";

test("plan gating: Starter 0 links, Hustle 1, Boss and owner unlimited", () => {
  assert.equal(bookingLinkLimit("free"), 0);
  assert.equal(bookingLinkLimit(null), 0);
  assert.equal(bookingLinkLimit("premium"), 1);
  assert.equal(bookingLinkLimit("pro"), null);
  assert.equal(bookingLinkLimit("free", true), null);
  assert.equal(depositAllowed("premium"), false);
  assert.equal(depositAllowed("pro"), true);
  assert.equal(depositAllowed("free", true), true);
});

test("bookable types keep the oldest after a downgrade", () => {
  const types = [
    { id: "b", active: true, position: 0, created_at: "2026-09-02" },
    { id: "a", active: true, position: 0, created_at: "2026-09-01" },
    { id: "c", active: false, position: 0, created_at: "2026-08-01" },
  ];
  assert.deepEqual(bookableTypes(types, 1).map((t) => t.id), ["a"]);
  assert.deepEqual(bookableTypes(types, null).map((t) => t.id), ["a", "b"]);
  assert.deepEqual(bookableTypes(types, 0), []);
});

test("slugs", () => {
  assert.equal(slugify("Café Déjà Vu!"), "cafe-deja-vu");
  assert.ok(SLUG_RE.test("woshi"));
  assert.ok(!SLUG_RE.test("-woshi"));
  assert.ok(!SLUG_RE.test("ab"));
  assert.ok(!SLUG_RE.test("Woshi"));
});

test("settings form", () => {
  const good = parseSettings({
    slug: "Woshi",
    timezone: "America/Toronto",
    weekly: JSON.stringify(defaultWeekly()),
    min_notice_hours: "4",
    horizon_days: "60",
    buffer_before_min: "0",
    buffer_after_min: "15",
    max_per_day: "",
    language: "fr",
    accent: "#FF00AA",
    enabled: "on",
  });
  assert.ok(good.ok);
  if (good.ok) {
    assert.equal(good.value.slug, "woshi");
    assert.equal(good.value.max_per_day, null);
    assert.equal(good.value.accent, "#ff00aa");
    assert.equal(good.value.enabled, true);
  }
  assert.equal(parseSettings({ slug: "woshi", timezone: "Mars/Base", weekly: defaultWeekly() }).ok, false);
  assert.equal(
    parseSettings({ slug: "woshi", timezone: "UTC", weekly: defaultWeekly(), min_notice_hours: 1, horizon_days: 999, buffer_before_min: 0, buffer_after_min: 0 }).ok,
    false
  );
});

test("meeting type form", () => {
  const t = parseMeetingType({
    name: "Intro call",
    duration_min: "30",
    location_kind: "phone",
    questions: JSON.stringify([
      { label: "What do you need?", kind: "long", required: true },
      { label: "Budget", kind: "choice", options: "Under $500\n$500+\n$500+" },
    ]),
    deposit: "25",
  });
  assert.ok(t.ok);
  if (t.ok) {
    assert.equal(t.value.slug, "intro-call");
    assert.equal(t.value.deposit_cents, 2500);
    assert.deepEqual(t.value.questions[1].options, ["Under $500", "$500+"]);
    assert.equal(t.value.questions[0].id, "q1");
  }
  assert.equal(parseMeetingType({ name: "X", duration_min: "20" }).ok, false);
  assert.equal(parseMeetingType({ name: "X", duration_min: "30", questions: JSON.stringify([{ label: "Pick", kind: "choice", options: "one" }]) }).ok, false);
});

test("visitor form: required answers, choice must be an option, no header tricks", () => {
  const qs = [
    { id: "q1", label: "Topic", kind: "short" as const, required: true, options: [] },
    { id: "q2", label: "Size", kind: "choice" as const, required: false, options: ["S", "M"] },
  ];
  const ok = parseVisitor({ name: "Ana\r\nBcc: x", email: "ana@example.com", answers: { q1: "Logo", q2: "XL" } }, qs);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.value.name, "Ana Bcc: x");
    assert.deepEqual(ok.value.answers, [{ id: "q1", label: "Topic", value: "Logo" }]);
  }
  assert.deepEqual(parseVisitor({ name: "Ana", email: "ana@example.com", answers: {} }, qs), { ok: false, error: "required" });
  assert.deepEqual(parseVisitor({ name: "Ana", email: "a@b" }, []), { ok: false, error: "email" });
  assert.deepEqual(parseVisitor({ name: "", email: "ana@example.com" }, []), { ok: false, error: "name" });
});

test("Google iCal address: only calendar.google.com over https", () => {
  const good = "https://calendar.google.com/calendar/ical/lucy%40gmail.com/private-0123456789abcdef0123456789abcdef/basic.ics";
  assert.equal(isGoogleIcalUrl(good), true);
  assert.equal(isGoogleIcalUrl(good.replace("https", "http")), false);
  assert.equal(isGoogleIcalUrl(good.replace("calendar.google.com", "calendar.google.com.evil.io")), false);
  assert.equal(isGoogleIcalUrl(good.replace("calendar.google.com", "calendar.google.com:8443")), false);
  assert.equal(isGoogleIcalUrl(good.replace("https://", "https://user:pw@")), false);
  assert.equal(isGoogleIcalUrl(good + "?redirect=http://169.254.169.254"), false);
  assert.equal(isGoogleIcalUrl("https://169.254.169.254/calendar/ical/x/private-0123456789abcdef/basic.ics"), false);
  assert.equal(isGoogleIcalUrl("https://calendar.google.com/calendar/ical/x/../../basic.ics"), false);
  assert.equal(isGoogleIcalUrl("file:///etc/passwd"), false);
  assert.ok(!maskIcalUrl(good)!.includes("0123456789abcdef0123"));
});

test("every language has every word", () => {
  const keys = Object.keys(BOOKING_STRINGS.en).sort();
  assert.deepEqual(Object.keys(BOOKING_STRINGS.fr).sort(), keys);
  assert.deepEqual(Object.keys(BOOKING_STRINGS.es).sort(), keys);
  assert.equal(bt("fr", "minutes", { n: 30 }), "30 min");
  assert.equal(bt("xx", "confirm"), "Confirm booking");
});
