// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLAN_LIMITS,
  effectiveTheme,
  formatBytes,
  limitMessage,
  nextPlan,
  parsePlanLimitError,
  themeAllowed,
} from "./plans.ts";

test("limits match the approved table", () => {
  assert.deepEqual(PLAN_LIMITS.free, { contacts: 10, docs: 5, storage: 50 * 1024 ** 2, email: 0, lines: 1 });
  assert.deepEqual(PLAN_LIMITS.premium, { contacts: 150, docs: 50, storage: 1024 ** 3, email: 50, lines: 3 });
  assert.deepEqual(PLAN_LIMITS.pro, { contacts: null, docs: null, storage: 10 * 1024 ** 3, email: 200, lines: null });
});

test("friendly limit message names the next plan and its price", () => {
  assert.equal(
    limitMessage("contacts", "free"),
    "You've reached 10 customers and leads on Starter. Hustle gives you 150 for $5 every 4 weeks."
  );
  assert.equal(
    limitMessage("contacts", "premium"),
    "You've reached 150 customers and leads on Hustle. Boss has no limit for $15 every 4 weeks."
  );
  assert.match(limitMessage("email", "free"), /isn't on Starter\. Hustle gives you 50/);
  assert.match(limitMessage("storage", "free"), /50 MB on Starter\. Hustle gives you 1 GB/);
  assert.match(limitMessage("storage", "pro"), /Delete something/);
});

test("database errors are recognised", () => {
  assert.equal(parsePlanLimitError("plan_limit:contacts:10"), "contacts");
  assert.equal(parsePlanLimitError("ERROR: plan_limit:lines:1"), "lines");
  assert.equal(parsePlanLimitError("plan_limit:convert"), "convert");
  assert.equal(parsePlanLimitError("duplicate key"), null);
  assert.equal(parsePlanLimitError(null), null);
});

test("Starter gets Clean and Dark only; paid plans and the owner get all", () => {
  assert.equal(themeAllowed("clean", "free"), true);
  assert.equal(themeAllowed("dark", "free"), true);
  assert.equal(themeAllowed("neon", "free"), false);
  assert.equal(themeAllowed("retro", "free"), false);
  assert.equal(themeAllowed("neon", "free", true), true);
  assert.equal(themeAllowed("retro", "premium"), true);
  assert.equal(themeAllowed("neon", "pro"), true);
});

test("a paid theme falls back to Clean after a downgrade", () => {
  assert.equal(effectiveTheme("neon", "free"), "clean");
  assert.equal(effectiveTheme("neon", "premium"), "neon");
  assert.equal(effectiveTheme("dark", "free"), "dark");
  assert.equal(effectiveTheme("bogus", "pro"), null);
  assert.equal(effectiveTheme(null, "pro"), null);
});

test("next plan and byte formatting", () => {
  assert.equal(nextPlan("free"), "premium");
  assert.equal(nextPlan("premium"), "pro");
  assert.equal(nextPlan("pro"), null);
  assert.equal(formatBytes(50 * 1024 ** 2), "50 MB");
  assert.equal(formatBytes(1.5 * 1024 ** 2), "1.5 MB");
  assert.equal(formatBytes(10 * 1024 ** 3), "10 GB");
});
