// Small hand-written input checks for the agent API (zod is not a
// dependency). Each helper returns the cleaned value or throws
// InputError, which the route turns into a 400.

export class InputError extends Error {}

export type Input = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// ISO timestamp with an explicit zone: 2026-09-29T13:00-04:00, ...Z
const ISO_TS =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Rejects any field the action does not know, so a typo is loud.
export function onlyFields(input: Input, allowed: string[]) {
  const extra = Object.keys(input).filter((k) => !allowed.includes(k));
  if (extra.length) {
    throw new InputError(`unknown field(s): ${extra.join(", ")}`);
  }
}

function present(v: unknown) {
  return v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "");
}

export function str(
  input: Input,
  field: string,
  opts: { required?: boolean; max: number; min?: number }
): string | null {
  const v = input[field];
  if (!present(v)) {
    if (opts.required) throw new InputError(`${field} is required`);
    return null;
  }
  if (typeof v !== "string") throw new InputError(`${field} must be a string`);
  const s = v.trim();
  if (s.length < (opts.min ?? 1)) throw new InputError(`${field} is too short`);
  if (s.length > opts.max) {
    throw new InputError(`${field} is too long (max ${opts.max} characters)`);
  }
  return s;
}

export function email(input: Input, field: string): string | null {
  const s = str(input, field, { max: 320 });
  if (s && !EMAIL.test(s)) throw new InputError(`${field} is not a valid email`);
  return s;
}

export function uuid(input: Input, field: string, required = false): string | null {
  const s = str(input, field, { required, max: 36 });
  if (s && !UUID.test(s)) throw new InputError(`${field} must be an id (uuid)`);
  return s ? s.toLowerCase() : null;
}

export function date(input: Input, field: string): string | null {
  const s = str(input, field, { max: 10 });
  if (!s) return null;
  if (!DATE.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    throw new InputError(`${field} must be a date like 2026-09-29`);
  }
  return s;
}

export function timestamp(
  input: Input,
  field: string,
  required = false
): string | null {
  const s = str(input, field, { required, max: 40 });
  if (!s) return null;
  const ms = Date.parse(s);
  if (!ISO_TS.test(s) || Number.isNaN(ms)) {
    throw new InputError(
      `${field} must be an ISO time with a zone, like 2026-09-29T13:00-04:00`
    );
  }
  return new Date(ms).toISOString();
}

export function oneOf<T extends string>(
  input: Input,
  field: string,
  values: readonly T[],
  required = false
): T | null {
  const s = str(input, field, { required, max: 40 });
  if (!s) return null;
  if (!values.includes(s as T)) {
    throw new InputError(`${field} must be one of: ${values.join(", ")}`);
  }
  return s as T;
}

export function money(input: Input, field: string): number | null {
  const v = input[field];
  if (!present(v)) return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 9_999_999_999) {
    throw new InputError(`${field} must be a number between 0 and 9999999999`);
  }
  return Math.round(n * 100) / 100;
}

// UTC offset like "-04:00" -> minutes (-240).
export function utcOffset(input: Input, field: string): number {
  const s = str(input, field, { max: 6 });
  if (!s) return 0;
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(s);
  if (!m) throw new InputError(`${field} must look like -04:00`);
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  if (minutes > 14 * 60) throw new InputError(`${field} is out of range`);
  return (m[1] === "-" ? -1 : 1) * minutes;
}

// Copy of the input for the audit log, with anything that looks like a
// secret blanked and long strings cut.
const SECRET_NAME = /pass|token|key|secret|auth|cookie/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[deep]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      out[k] = SECRET_NAME.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 500) {
    return value.slice(0, 500) + "…";
  }
  return value;
}
