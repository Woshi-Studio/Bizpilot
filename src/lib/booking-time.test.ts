// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countPerDay,
  defaultWeekly,
  generateSlots,
  isSlotFree,
  localDate,
  localHm,
  offsetMinutes,
  parseWeekly,
  slotStep,
  zonedToUtc,
  type BookingRules,
} from "./booking-time.ts";

const TZ = "America/Toronto";
const rules = (patch: Partial<BookingRules> = {}): BookingRules => ({
  timezone: TZ,
  weekly: defaultWeekly(), // Mon-Fri 9-5
  minNoticeHours: 0,
  horizonDays: 14,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  maxPerDay: null,
  ...patch,
});

// Monday 2026-09-28 06:00 in Toronto (EDT, UTC-4) = 10:00Z
const MON_6AM = Date.parse("2026-09-28T10:00:00Z");

test("time zone math: Toronto summer and winter, Kolkata half hour", () => {
  assert.equal(offsetMinutes(Date.parse("2026-07-01T12:00:00Z"), TZ), -240);
  assert.equal(offsetMinutes(Date.parse("2026-12-01T12:00:00Z"), TZ), -300);
  assert.equal(zonedToUtc("2026-09-29", "13:00", TZ), Date.parse("2026-09-29T17:00:00Z"));
  assert.equal(zonedToUtc("2026-12-01", "09:00", TZ), Date.parse("2026-12-01T14:00:00Z"));
  assert.equal(zonedToUtc("2026-09-29", "09:00", "Asia/Kolkata"), Date.parse("2026-09-29T03:30:00Z"));
  assert.equal(localDate(Date.parse("2026-09-29T03:30:00Z"), TZ), "2026-09-28");
  assert.equal(localHm(Date.parse("2026-09-29T17:00:00Z"), TZ), "13:00");
});

test("slots follow weekly hours in the business zone", () => {
  const slots = generateSlots({ rules: rules(), durationMin: 60, busy: [], now: MON_6AM, to: MON_6AM + 20 * 3_600_000 });
  // Mon 9:00..16:00 every 30 min = 15 slots
  assert.equal(slots.length, 15);
  assert.equal(localHm(slots[0], TZ), "09:00");
  assert.equal(localHm(slots[slots.length - 1], TZ), "16:00");
  assert.equal(slotStep(15), 15);
  assert.equal(slotStep(60), 30);
});

test("no slots on days off", () => {
  const sat = Date.parse("2026-10-03T10:00:00Z");
  const slots = generateSlots({ rules: rules(), durationMin: 30, busy: [], now: sat, to: sat + 30 * 3_600_000 });
  assert.equal(slots.length, 0);
});

test("minimum notice hides the next hours", () => {
  const slots = generateSlots({ rules: rules({ minNoticeHours: 4 }), durationMin: 60, busy: [], now: Date.parse("2026-09-28T13:00:00Z"), to: Date.parse("2026-09-28T23:00:00Z") });
  // now = 9:00 local, +4 h = 13:00
  assert.equal(localHm(slots[0], TZ), "13:00");
});

test("horizon stops far-away days", () => {
  const slots = generateSlots({ rules: rules({ horizonDays: 2 }), durationMin: 60, busy: [], now: MON_6AM });
  assert.ok(slots.every((s) => s <= MON_6AM + 2 * 86_400_000));
  assert.ok(slots.some((s) => localDate(s, TZ) === "2026-09-29"));
  assert.ok(!slots.some((s) => localDate(s, TZ) === "2026-09-30"));
});

test("busy time and buffers block overlapping slots", () => {
  const busy = [{ start: zonedToUtc("2026-09-28", "11:00", TZ), end: zonedToUtc("2026-09-28", "12:00", TZ) }];
  const plain = generateSlots({ rules: rules(), durationMin: 30, busy, now: MON_6AM, to: MON_6AM + 20 * 3_600_000 }).map((s) => localHm(s, TZ));
  assert.ok(plain.includes("10:30"));
  assert.ok(!plain.includes("11:00"));
  assert.ok(!plain.includes("11:30"));
  assert.ok(plain.includes("12:00"));
  const buffered = generateSlots({ rules: rules({ bufferBeforeMin: 15, bufferAfterMin: 15 }), durationMin: 30, busy, now: MON_6AM, to: MON_6AM + 20 * 3_600_000 }).map((s) => localHm(s, TZ));
  assert.ok(!buffered.includes("10:30")); // its 15-min after-buffer touches 11:00
  assert.ok(!buffered.includes("12:00")); // its before-buffer touches 12:00
  assert.ok(buffered.includes("12:30"));
});

test("max per day closes a full day", () => {
  const perDay = countPerDay([zonedToUtc("2026-09-28", "10:00", TZ), zonedToUtc("2026-09-28", "14:00", TZ)], TZ);
  assert.deepEqual(perDay, { "2026-09-28": 2 });
  const slots = generateSlots({ rules: rules({ maxPerDay: 2 }), durationMin: 30, busy: [], bookedPerDay: perDay, now: MON_6AM, to: MON_6AM + 40 * 3_600_000 });
  assert.ok(slots.every((s) => localDate(s, TZ) !== "2026-09-28"));
  assert.ok(slots.some((s) => localDate(s, TZ) === "2026-09-29"));
});

test("split ranges and a clock change day", () => {
  const weekly = defaultWeekly();
  weekly[0] = [["09:00", "10:00"], ["13:00", "14:00"]]; // Sunday
  const sunday = Date.parse("2026-11-01T05:00:00Z"); // clocks go back that night
  const slots = generateSlots({ rules: rules({ weekly }), durationMin: 30, busy: [], now: sunday, to: sunday + 20 * 3_600_000 }).map((s) => localHm(s, TZ));
  assert.deepEqual(slots, ["09:00", "09:30", "13:00", "13:30"]);
});

test("isSlotFree agrees with the list", () => {
  const start = zonedToUtc("2026-09-28", "10:00", TZ);
  assert.equal(isSlotFree({ rules: rules(), durationMin: 60, busy: [], now: MON_6AM, start }), true);
  assert.equal(isSlotFree({ rules: rules(), durationMin: 60, busy: [], now: MON_6AM, start: start + 10 * 60_000 }), false);
  assert.equal(isSlotFree({ rules: rules({ minNoticeHours: 5 }), durationMin: 60, busy: [], now: MON_6AM, start }), false);
});

test("weekly hours are checked", () => {
  assert.ok(parseWeekly(defaultWeekly()));
  assert.equal(parseWeekly([]), null);
  const bad = defaultWeekly();
  bad[1] = [["10:00", "09:00"]];
  assert.equal(parseWeekly(bad), null);
  const overlap = defaultWeekly();
  overlap[1] = [["09:00", "12:00"], ["11:00", "13:00"]];
  assert.equal(parseWeekly(overlap), null);
  const unsorted = defaultWeekly();
  unsorted[2] = [["13:00", "17:00"], ["09:00", "12:00"]];
  assert.deepEqual(parseWeekly(unsorted)![2], [["09:00", "12:00"], ["13:00", "17:00"]]);
  const late = defaultWeekly();
  late[3] = [["09:00", "24:00"]];
  assert.equal(parseWeekly(late), null);
});
