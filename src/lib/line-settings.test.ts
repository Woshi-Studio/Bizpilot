// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, defaultLineSettings, invoiceTotals, settingsFor } from "./line-settings.ts";

test("Woshi Studio, VWA and Casa Norte bill in CAD by default", () => {
  assert.equal(defaultLineSettings("Woshi Studio", "USD").currency, "CAD");
  assert.equal(defaultLineSettings("VWA", "USD").currency, "CAD");
  assert.equal(defaultLineSettings("casa norte", "USD").currency, "CAD");
  assert.equal(defaultLineSettings("Alpha Shop", "USD").currency, "USD");
  assert.equal(defaultLineSettings(null, "EUR").currency, "EUR");
  assert.equal(defaultLineSettings(null, "XYZ").currency, "USD");
  assert.equal(defaultLineSettings("VWA", "USD").due_days, 14);
});

test("saved settings win over the defaults", () => {
  const saved = [{ line: "VWA", currency: "USD", tax_label: "HST", tax_rate: 13, due_days: 30 }];
  const s = settingsFor("vwa", saved, "USD");
  assert.equal(s.currency, "USD");
  assert.equal(s.tax_rate, 13);
  assert.equal(s.due_days, 30);
  assert.equal(s.saved, true);
  assert.equal(settingsFor("Woshi Studio", saved, "USD").currency, "CAD");
});

test("HST 13% is added as its own line", () => {
  const t = invoiceTotals([{ quantity: 2, unit_price: 50 }, { quantity: "1", unit_price: "100" }], 13);
  assert.deepEqual(t, { subtotal: 200, tax: 26, total: 226 });
  assert.deepEqual(invoiceTotals([{ quantity: 1, unit_price: 10 }], 0), { subtotal: 10, tax: 0, total: 10 });
});

test("due date is the issue date plus the line's days", () => {
  assert.equal(addDays("2026-09-26", 14), "2026-10-10");
  assert.equal(addDays("2026-12-25", 10), "2027-01-04");
  assert.equal(addDays("nope", 3), "");
});
