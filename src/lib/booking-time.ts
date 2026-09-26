// Time zones and free slots for the booking page. Pure functions, no
// imports, so `npm test` can load it with plain `node --test`
// (see booking-time.test.ts).
//
// Weekly hours are kept in the business's own time zone ("09:00"-"17:00"
// on Mondays in America/Toronto). Every slot is a UTC instant; the
// visitor's browser shows it in the visitor's own zone.

export type TimeRange = [string, string]; // "HH:MM" - "HH:MM", same day
export type Weekly = TimeRange[][]; // 7 lists, index 0 = Sunday

export type Interval = { start: number; end: number }; // UTC ms, end exclusive

export type BookingRules = {
  timezone: string;
  weekly: Weekly;
  minNoticeHours: number;
  horizonDays: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  maxPerDay: number | null;
};

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 86_400_000;

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const formats = new Map<string, Intl.DateTimeFormat>();
function partsFormat(tz: string) {
  let f = formats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formats.set(tz, f);
  }
  return f;
}

export type LocalParts = { y: number; m: number; d: number; hh: number; mm: number; ss: number };

// The wall-clock date and time of a UTC instant in a time zone.
export function localParts(ms: number, tz: string): LocalParts {
  const out: Record<string, number> = {};
  for (const p of partsFormat(tz).formatToParts(new Date(ms))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    y: out.year,
    m: out.month,
    d: out.day,
    hh: out.hour === 24 ? 0 : out.hour,
    mm: out.minute,
    ss: out.second,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

// Minutes the zone is ahead of UTC at that instant (Toronto in summer: -240).
export function offsetMinutes(ms: number, tz: string): number {
  const p = localParts(ms, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

// "YYYY-MM-DD" in the zone.
export function localDate(ms: number, tz: string): string {
  const p = localParts(ms, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

// "HH:MM" in the zone.
export function localHm(ms: number, tz: string): string {
  const p = localParts(ms, tz);
  return `${pad(p.hh)}:${pad(p.mm)}`;
}

// Wall-clock date + time in a zone -> UTC ms. A time that doesn't exist
// (the hour skipped when clocks go forward) lands an hour later; callers
// that care check it with localHm().
export function zonedToUtc(date: string, time: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off1 = offsetMinutes(guess, tz);
  let t = guess - off1 * 60_000;
  const off2 = offsetMinutes(t, tz);
  if (off2 !== off1) t = guess - off2 * 60_000;
  return t;
}

export function addDaysStr(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function hmToMin(hm: string): number {
  const m = HM.exec(hm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

export function minToHm(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

// ------------------------------------------------------------------
// Weekly hours
// ------------------------------------------------------------------

export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function defaultWeekly(): Weekly {
  const nine = (): TimeRange[] => [["09:00", "17:00"]];
  return [[], nine(), nine(), nine(), nine(), nine(), []];
}

// Cleans weekly hours from a form or the database. null = not valid.
// Each day: up to 6 ranges, "HH:MM" < "HH:MM", sorted, not overlapping.
export function parseWeekly(raw: unknown): Weekly | null {
  if (!Array.isArray(raw) || raw.length !== 7) return null;
  const out: Weekly = [];
  for (const day of raw) {
    if (!Array.isArray(day) || day.length > 6) return null;
    const ranges: TimeRange[] = [];
    for (const r of day) {
      if (!Array.isArray(r) || r.length !== 2) return null;
      const [a, b] = r;
      if (typeof a !== "string" || typeof b !== "string" || !HM.test(a) || !HM.test(b)) return null;
      if (hmToMin(a) >= hmToMin(b)) return null;
      ranges.push([a, b]);
    }
    ranges.sort((x, y) => hmToMin(x[0]) - hmToMin(y[0]));
    for (let i = 1; i < ranges.length; i++) {
      if (hmToMin(ranges[i][0]) < hmToMin(ranges[i - 1][1])) return null;
    }
    out.push(ranges);
  }
  return out;
}

// ------------------------------------------------------------------
// Slots
// ------------------------------------------------------------------

// A 15 or 45 minute meeting can start every 15 minutes; 30 and 60 every 30.
export function slotStep(durationMin: number): number {
  return durationMin === 15 || durationMin === 45 ? 15 : 30;
}

export function overlaps(start: number, end: number, busy: Interval[]): boolean {
  for (const b of busy) {
    if (b.start < end && b.end > start) return true;
  }
  return false;
}

// Every free start time (UTC ms), in order.
//   busy         existing meetings, blocked time, other bookings and the
//                Google calendar's busy times
//   bookedPerDay bookings already on each business-local day, for maxPerDay
//   from / to    optional window (UTC ms) inside the notice / horizon limits
export function generateSlots(opts: {
  rules: BookingRules;
  durationMin: number;
  busy: Interval[];
  bookedPerDay?: Record<string, number>;
  now: number;
  from?: number;
  to?: number;
}): number[] {
  const { rules, durationMin, busy, now } = opts;
  const tz = rules.timezone;
  if (!isValidTimeZone(tz)) return [];
  const earliest = now + rules.minNoticeHours * 3_600_000;
  const latest = now + rules.horizonDays * DAY_MS;
  const from = Math.max(opts.from ?? earliest, earliest);
  const to = Math.min(opts.to ?? latest, latest);
  if (!(to >= from)) return [];

  const step = slotStep(durationMin);
  const before = rules.bufferBeforeMin * 60_000;
  const after = rules.bufferAfterMin * 60_000;
  const perDay = opts.bookedPerDay ?? {};
  const out: number[] = [];

  let day = localDate(from, tz);
  const lastDay = localDate(to, tz);
  for (let guard = 0; day <= lastDay && guard < 400; guard++, day = addDaysStr(day, 1)) {
    if (rules.maxPerDay !== null && (perDay[day] ?? 0) >= rules.maxPerDay) continue;
    for (const [a, b] of rules.weekly[weekdayOf(day)] ?? []) {
      const endMin = hmToMin(b);
      for (let t = hmToMin(a); t + durationMin <= endMin; t += step) {
        const hm = minToHm(t);
        const s = zonedToUtc(day, hm, tz);
        if (localHm(s, tz) !== hm) continue; // skipped by a clock change
        if (s < from || s > to) continue;
        const e = s + durationMin * 60_000;
        if (localDate(e - 1, tz) !== day) continue;
        if (overlaps(s - before, e + after, busy)) continue;
        out.push(s);
      }
    }
  }
  return [...new Set(out)].sort((x, y) => x - y);
}

// Is this exact start time one of the free slots?
export function isSlotFree(opts: Parameters<typeof generateSlots>[0] & { start: number }): boolean {
  const { start, ...rest } = opts;
  return generateSlots({ ...rest, from: start, to: start }).includes(start);
}

// Bookings per business-local day, for maxPerDay.
export function countPerDay(starts: number[], tz: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of starts) {
    const d = localDate(s, tz);
    out[d] = (out[d] ?? 0) + 1;
  }
  return out;
}
