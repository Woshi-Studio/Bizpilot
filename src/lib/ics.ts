// Calendar files. Pure, no imports (see ics.test.ts).
//   buildIcs()      the "Add to calendar" attachment for a booking
//   parseIcalBusy() the busy times in a Google Calendar iCal feed

import { zonedToUtc, isValidTimeZone, type Interval } from "./booking-time.ts";

const utcStamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// RFC 5545 text: escape \ ; , and newlines.
function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Lines longer than 75 octets are folded (CRLF + space).
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  let first = true;
  while (Buffer.byteLength(rest, "utf8") > (first ? 75 : 74)) {
    let cut = first ? 75 : 74;
    while (Buffer.byteLength(rest.slice(0, cut), "utf8") > (first ? 75 : 74)) cut--;
    out.push((first ? "" : " ") + rest.slice(0, cut));
    rest = rest.slice(cut);
    first = false;
  }
  out.push((first ? "" : " ") + rest);
  return out.join("\r\n");
}

export function buildIcs(opts: {
  uid: string;
  start: number;
  end: number;
  summary: string;
  description?: string;
  location?: string | null;
  url?: string | null;
  cancel?: boolean;
  sequence?: number;
  now?: number;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Jephelen//Booking//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${opts.cancel ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${opts.uid.replace(/[^A-Za-z0-9@._-]/g, "")}`,
    `DTSTAMP:${utcStamp(opts.now ?? Date.now())}`,
    `DTSTART:${utcStamp(opts.start)}`,
    `DTEND:${utcStamp(opts.end)}`,
    `SEQUENCE:${opts.sequence ?? 0}`,
    `SUMMARY:${esc(opts.summary.slice(0, 200))}`,
    ...(opts.description ? [`DESCRIPTION:${esc(opts.description.slice(0, 2000))}`] : []),
    ...(opts.location ? [`LOCATION:${esc(opts.location.slice(0, 300))}`] : []),
    ...(opts.url && /^https?:\/\/\S+$/.test(opts.url) ? [`URL:${opts.url}`] : []),
    `STATUS:${opts.cancel ? "CANCELLED" : "CONFIRMED"}`,
    ...(opts.cancel
      ? []
      : ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Reminder", "TRIGGER:-PT30M", "END:VALARM"]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

// ------------------------------------------------------------------
// Reading a feed
// ------------------------------------------------------------------

type Prop = { name: string; params: Record<string, string>; value: string };

function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
}

function parseLine(line: string): Prop | null {
  const colon = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...rawParams] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: value.trim() };
}

// A DTSTART / DTEND / EXDATE / RDATE value -> UTC ms and whether it's a
// whole day. Floating times (no zone) use the fallback zone.
export function parseIcsDate(value: string, tzid: string | undefined, fallbackTz: string): { ms: number; allDay: boolean } | null {
  const v = value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly) {
    const date = `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
    return { ms: zonedToUtc(date, "00:00", fallbackTz), allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  if (m[7] === "Z") {
    return { ms: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]), allDay: false };
  }
  const tz = tzid && isValidTimeZone(tzid) ? tzid : fallbackTz;
  return { ms: zonedToUtc(`${m[1]}-${m[2]}-${m[3]}`, `${m[4]}:${m[5]}`, tz) + Number(m[6]) * 1000, allDay: false };
}

// "PT1H30M", "P1D" -> ms
export function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, sign, w, d, h, min, s] = m;
  const ms = ((+(w ?? 0) * 7 + +(d ?? 0)) * 86_400 + +(h ?? 0) * 3600 + +(min ?? 0) * 60 + +(s ?? 0)) * 1000;
  return sign === "-" ? -ms : ms;
}

type Rrule = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  count: number | null;
  until: number | null;
  byday: number[] | null; // 0 = Sunday (plain weekdays only)
};

const DAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseRrule(value: string, fallbackTz: string): Rrule | null {
  const parts: Record<string, string> = {};
  for (const kv of value.split(";")) {
    const [k, v] = kv.split("=");
    if (k && v) parts[k.toUpperCase()] = v.toUpperCase();
  }
  const freq = parts.FREQ as Rrule["freq"];
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null;
  // Rules like "the 2nd Tuesday" (BYDAY=2TU, BYSETPOS…) are not expanded;
  // the caller keeps only the first occurrence.
  if (parts.BYSETPOS || (parts.BYDAY && /[0-9]/.test(parts.BYDAY)) || parts.BYMONTHDAY?.includes(",")) return null;
  const until = parts.UNTIL ? parseIcsDate(parts.UNTIL, undefined, fallbackTz)?.ms ?? null : null;
  const byday = parts.BYDAY ? parts.BYDAY.split(",").map((d) => DAYS[d]).filter((n) => n !== undefined) : null;
  return {
    freq,
    interval: Math.max(1, Math.min(1000, Number(parts.INTERVAL ?? 1) || 1)),
    count: parts.COUNT ? Math.max(1, Math.min(5000, Number(parts.COUNT) || 1)) : null,
    until,
    byday: byday && byday.length ? byday : null,
  };
}

type RawEvent = {
  start?: { ms: number; allDay: boolean };
  startValue?: string;
  startTz?: string;
  end?: { ms: number; allDay: boolean };
  duration?: number | null;
  rrule?: string;
  exdates: number[];
  transparent: boolean;
  cancelled: boolean;
  recurrenceId: boolean;
};

// Local wall-clock parts of a floating/zoned DTSTART, to repeat it on
// other days at the same local time.
function wallClock(value: string) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(value);
  if (!m) return null;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${m[4]}:${m[5]}` : "00:00" };
}

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function addMonths(date: string, n: number): string | null {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  if (d > last) return null; // e.g. the 31st in a 30-day month: skipped, as RFC 5545 says
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Busy intervals (UTC ms) that touch [windowStart, windowEnd].
// Skips free ("TRANSP:TRANSPARENT") and cancelled events. Repeating events
// are expanded for DAILY / WEEKLY (+BYDAY) / MONTHLY / YEARLY with
// INTERVAL, COUNT, UNTIL and EXDATE. A moved single occurrence
// (RECURRENCE-ID) is added as its own event; the original time may also
// stay busy, which only ever hides a slot, never double-books.
export function parseIcalBusy(
  text: string,
  windowStart: number,
  windowEnd: number,
  fallbackTz = "UTC",
  maxIntervals = 5000
): Interval[] {
  const out: Interval[] = [];
  let calTz = fallbackTz;
  let ev: RawEvent | null = null;

  const push = (s: number, e: number) => {
    if (e > windowStart && s < windowEnd && e > s && out.length < maxIntervals) out.push({ start: s, end: e });
  };

  for (const line of unfold(text)) {
    const p = parseLine(line);
    if (!p) continue;
    if (!ev) {
      if (p.name === "X-WR-TIMEZONE" && isValidTimeZone(p.value)) calTz = p.value;
      if (p.name === "BEGIN" && p.value.toUpperCase() === "VEVENT") {
        ev = { exdates: [], transparent: false, cancelled: false, recurrenceId: false };
      }
      continue;
    }
    switch (p.name) {
      case "DTSTART":
        ev.start = parseIcsDate(p.value, p.params.TZID, calTz) ?? undefined;
        ev.startValue = p.value;
        ev.startTz = p.params.TZID && isValidTimeZone(p.params.TZID) ? p.params.TZID : /Z$/.test(p.value) ? "UTC" : calTz;
        break;
      case "DTEND":
        ev.end = parseIcsDate(p.value, p.params.TZID, calTz) ?? undefined;
        break;
      case "DURATION":
        ev.duration = parseDuration(p.value);
        break;
      case "RRULE":
        ev.rrule = p.value;
        break;
      case "EXDATE":
        for (const v of p.value.split(",")) {
          const d = parseIcsDate(v, p.params.TZID, calTz);
          if (d) ev.exdates.push(d.ms);
        }
        break;
      case "TRANSP":
        ev.transparent = p.value.toUpperCase() === "TRANSPARENT";
        break;
      case "STATUS":
        ev.cancelled = p.value.toUpperCase() === "CANCELLED";
        break;
      case "RECURRENCE-ID":
        ev.recurrenceId = true;
        break;
      case "END":
        if (p.value.toUpperCase() === "VEVENT") {
          expand(ev);
          ev = null;
        }
        break;
    }
  }
  return out.sort((a, b) => a.start - b.start);

  function expand(e: RawEvent) {
    if (!e.start || e.transparent || e.cancelled) return;
    const length = e.end
      ? e.end.ms - e.start.ms
      : e.duration ?? (e.start.allDay ? 86_400_000 : 0);
    if (!(length > 0)) return;
    const rule = e.rrule && !e.recurrenceId ? parseRrule(e.rrule, calTz) : null;
    if (!rule) {
      push(e.start.ms, e.start.ms + length);
      return;
    }
    const wc = wallClock(e.startValue ?? "");
    const tz = e.startTz ?? calTz;
    if (!wc) return;
    const excluded = new Set(e.exdates);
    let made = 0;
    const emit = (date: string) => {
      const s = /Z$/.test(e.startValue ?? "")
        ? Date.parse(`${date}T${wc.time}:00Z`) + (e.start!.ms % 60_000)
        : zonedToUtc(date, wc.time, tz);
      if (s < e.start!.ms) return true;
      if (rule.until !== null && s > rule.until) return false;
      if (rule.count !== null && made >= rule.count) return false;
      made++;
      if (!excluded.has(s)) push(s, s + length);
      return s < windowEnd;
    };

    // Walk period by period. Without COUNT, jump straight to the window
    // (an old daily event could otherwise take thousands of steps).
    const periodMs =
      { DAILY: 1, WEEKLY: 7, MONTHLY: 31, YEARLY: 366 }[rule.freq] * rule.interval * 86_400_000;
    const skip =
      rule.count === null
        ? Math.max(0, Math.floor((windowStart - e.start.ms - length) / periodMs) - 1)
        : 0;
    for (let i = skip, go = true; go && i < skip + 3000; i++) {
      const n = i * rule.interval;
      if (rule.freq === "DAILY") {
        go = emit(addDays(wc.date, n));
      } else if (rule.freq === "WEEKLY") {
        const firstDow = new Date(`${wc.date}T00:00:00Z`).getUTCDay();
        const weekStart = addDays(wc.date, n * 7 - firstDow);
        const days = rule.byday ?? [firstDow];
        for (const dow of [...days].sort((a, b) => a - b)) {
          if (!(go = emit(addDays(weekStart, dow)))) break;
        }
      } else if (rule.freq === "MONTHLY") {
        const d = addMonths(wc.date, n);
        if (d) go = emit(d);
      } else {
        const d = addMonths(wc.date, n * 12);
        if (d) go = emit(d);
      }
    }
  }
}
