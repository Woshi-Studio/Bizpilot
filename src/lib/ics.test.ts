// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIcs, parseDuration, parseIcalBusy } from "./ics.ts";

test("buildIcs makes a valid event with escaped text and folded lines", () => {
  const ics = buildIcs({
    uid: "abc@jephelen",
    start: Date.parse("2026-09-29T17:00:00Z"),
    end: Date.parse("2026-09-29T17:30:00Z"),
    summary: "Intro call; with, Woshi",
    description: "Line one\nLine two " + "x".repeat(120),
    now: Date.parse("2026-09-26T12:00:00Z"),
  });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20260929T170000Z\r\n/);
  assert.match(ics, /DTEND:20260929T173000Z\r\n/);
  assert.match(ics, /SUMMARY:Intro call\\; with\\, Woshi\r\n/);
  assert.match(ics, /METHOD:PUBLISH/);
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, line);
  const cancel = buildIcs({ uid: "abc", start: 0, end: 60_000, summary: "x", cancel: true, sequence: 2 });
  assert.match(cancel, /METHOD:CANCEL/);
  assert.match(cancel, /STATUS:CANCELLED/);
  assert.match(cancel, /SEQUENCE:2/);
});

const FEED = [
  "BEGIN:VCALENDAR",
  "X-WR-TIMEZONE:America/Toronto",
  "BEGIN:VEVENT",
  "DTSTART:20260929T140000Z",
  "DTEND:20260929T150000Z",
  "SUMMARY:Private dentist",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;TZID=America/Toronto:20260930T090000",
  "DTEND;TZID=America/Toronto:20260930T093000",
  "RRULE:FREQ=WEEKLY;BYDAY=WE,FR;COUNT=4",
  "EXDATE;TZID=America/Toronto:20261002T090000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20261005",
  "DTEND;VALUE=DATE:20261006",
  "SUMMARY:Day off",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20261001T140000Z",
  "DTEND:20261001T150000Z",
  "TRANSP:TRANSPARENT",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20261001T160000Z",
  "DURATION:PT45M",
  "STATUS:CANCELLED",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20200101T120000Z",
  "DTEND:20200101T121500Z",
  "RRULE:FREQ=DAILY",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

test("parseIcalBusy reads single, repeating, all-day events and skips free/cancelled", () => {
  const from = Date.parse("2026-09-28T00:00:00Z");
  const to = Date.parse("2026-10-08T00:00:00Z");
  const busy = parseIcalBusy(FEED, from, to);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16);
  const starts = busy.map((b) => iso(b.start));
  assert.ok(starts.includes("2026-09-29T14:00"));
  // weekly Wed+Fri 9:00 Toronto = 13:00Z; Oct 2 excluded; COUNT=4 -> Sep30, Oct2(x), Oct7, Oct9(outside)
  assert.ok(starts.includes("2026-09-30T13:00"));
  assert.ok(!starts.includes("2026-10-02T13:00"));
  assert.ok(starts.includes("2026-10-07T13:00"));
  // all-day in the calendar's zone: Oct 5 00:00 Toronto = 04:00Z, 24 h
  const dayOff = busy.find((b) => iso(b.start) === "2026-10-05T04:00");
  assert.ok(dayOff);
  assert.equal(dayOff!.end - dayOff!.start, 86_400_000);
  assert.ok(!starts.includes("2026-10-01T14:00")); // transparent
  assert.ok(!starts.includes("2026-10-01T16:00")); // cancelled
  // an old daily event still shows up in the window (every day at 12:00Z)
  assert.ok(starts.includes("2026-10-03T12:00"));
  assert.equal(busy.filter((b) => iso(b.start).endsWith("T12:00")).length, 10);
});

test("durations", () => {
  assert.equal(parseDuration("PT1H30M"), 90 * 60_000);
  assert.equal(parseDuration("P1D"), 86_400_000);
  assert.equal(parseDuration("nope"), null);
});
