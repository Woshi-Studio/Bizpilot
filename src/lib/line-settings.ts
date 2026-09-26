// Per business line: invoice currency, tax and days until due
// (business_line_settings, migration 0017). Pure, no imports, so
// `npm test` can load it (line-settings.test.ts).

export const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "MXN", "DOP"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type LineSettings = {
  line: string;
  currency: string;
  tax_label: string | null;
  tax_rate: number; // percent, e.g. 13
  due_days: number;
  saved: boolean; // false = a default, nothing stored yet
};

// Lines that bill in Canadian dollars unless changed in Settings.
const CAD_LINES = ["woshi studio", "vwa", "casa norte"];

export const TAX_PRESETS: { label: string; rate: number }[] = [
  { label: "HST", rate: 13 },
  { label: "GST", rate: 5 },
];

export function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && (CURRENCIES as readonly string[]).includes(v);
}

export function defaultLineSettings(line: string | null, businessCurrency: string): LineSettings {
  const cad = !!line && CAD_LINES.includes(line.trim().toLowerCase());
  return {
    line: line ?? "",
    currency: cad ? "CAD" : isCurrency(businessCurrency) ? businessCurrency : "USD",
    tax_label: null,
    tax_rate: 0,
    due_days: 14,
    saved: false,
  };
}

// Saved settings for a line, else the defaults.
export function settingsFor(
  line: string | null | undefined,
  saved: Omit<LineSettings, "saved">[],
  businessCurrency: string
): LineSettings {
  const key = (line ?? "").trim().toLowerCase();
  const row = key ? saved.find((s) => s.line.toLowerCase() === key) : undefined;
  if (row) {
    return {
      line: row.line,
      currency: isCurrency(row.currency) ? row.currency : "USD",
      tax_label: row.tax_label,
      tax_rate: Number(row.tax_rate) || 0,
      due_days: Number.isFinite(Number(row.due_days)) ? Number(row.due_days) : 14,
      saved: true,
    };
  }
  return defaultLineSettings(line ?? null, businessCurrency);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Subtotal, tax and total of an invoice.
export function invoiceTotals(
  items: { quantity: number | string; unit_price: number | string }[],
  taxRate: number | string | null | undefined
) {
  const subtotal = round2(
    items.reduce((sum, i) => {
      const q = Number(i.quantity);
      const p = Number(i.unit_price);
      return Number.isFinite(q) && Number.isFinite(p) ? sum + q * p : sum;
    }, 0)
  );
  const rate = Number(taxRate) || 0;
  const tax = round2((subtotal * rate) / 100);
  return { subtotal, tax, total: round2(subtotal + tax) };
}

// YYYY-MM-DD plus some days.
export function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
