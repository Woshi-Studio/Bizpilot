// The owner's business lines. One Jephelen business can hold several
// lines (e.g. Woshi Studio and VWA). `value` is what is stored in the
// business_line column; `label` is what the owner sees. Free text is
// allowed too: anything typed that isn't on this list is stored as-is.
export const BUSINESS_LINES: { value: string; label: string }[] = [
  { value: "Woshi Studio", label: "Woshi Studio" },
  { value: "VWA", label: "VWA Language Access" },
  { value: "Alpha Shop", label: "Alpha Shop" },
  { value: "Casa Norte", label: "Casa Norte" },
  { value: "S&S Diesel", label: "S&S Diesel" },
  { value: "WhiskerTorium", label: "WhiskerTorium" },
  { value: "Other", label: "Other" },
];

// URL value for "rows with no business line".
export const NO_LINE = "none";

export const MAX_LINE_LENGTH = 60;

export function lineLabel(value: string | null | undefined) {
  if (!value) return "Unassigned";
  return BUSINESS_LINES.find((l) => l.value === value)?.label ?? value;
}

// Cleans a line typed or picked in a form. Matches the config list
// case-insensitively (by value or label) so "vwa" and "VWA Language
// Access" both store "VWA". Empty -> null.
export function normalizeLine(raw: unknown): string | null {
  const text = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LINE_LENGTH);
  if (!text) return null;
  const lower = text.toLowerCase();
  const known = BUSINESS_LINES.find(
    (l) => l.value.toLowerCase() === lower || l.label.toLowerCase() === lower
  );
  return known ? known.value : text;
}

// Reads the ?line= URL param. Returns undefined for "all".
export function lineFromParam(
  raw: string | string[] | undefined
): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return undefined;
  if (v === NO_LINE) return NO_LINE;
  return normalizeLine(v) ?? undefined;
}

// Config lines first (in config order), then any free-text lines found
// in the data, alphabetically.
export function mergeLines(found: (string | null | undefined)[]): string[] {
  const config = BUSINESS_LINES.map((l) => l.value);
  const extra = [
    ...new Set(
      found.filter((v): v is string => !!v && !config.includes(v))
    ),
  ].sort((a, b) => a.localeCompare(b));
  return [...config, ...extra];
}
