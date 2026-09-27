// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balanceOf,
  canAfford,
  creditLine,
  heldOf,
  refundIsAutomatic,
  refundedIn,
  settleRows,
  submitRows,
  usedIn,
  type LedgerRow,
} from "./finder-credits.ts";

test("a researched search: hold, then release + spend when found", () => {
  const rows: LedgerRow[] = [{ delta: 10, reason: "grant" }];
  rows.push(...submitRows("queued", false).map((r) => ({ ...r, item_id: "a" })));
  assert.equal(balanceOf(rows), 9);
  assert.equal(heldOf(rows), 1);
  rows.push(...settleRows({ held: true, found: true, unlimited: false }).map((r) => ({ ...r, item_id: "a" })));
  assert.equal(balanceOf(rows), 9, "1 spent in the end");
  assert.equal(heldOf(rows), 0);
  // Same sequence the database test (PGlite) checked: grant, hold, release, spend
  assert.deepEqual(rows.map((r) => `${r.reason}${r.delta}`), ["grant10", "hold-1", "release1", "spend-1"]);
});

test("not found is free", () => {
  const rows: LedgerRow[] = [{ delta: 5, reason: "grant" }];
  rows.push(...submitRows("queued", false).map((r) => ({ ...r, item_id: "b" })));
  rows.push(...settleRows({ held: true, found: false, unlimited: false }).map((r) => ({ ...r, item_id: "b" })));
  assert.equal(balanceOf(rows), 5);
  assert.equal(heldOf(rows), 0);
});

test("known company: 1 credit at once; picking from a list is free", () => {
  assert.deepEqual(submitRows("known", false), [{ delta: -1, reason: "spend" }]);
  assert.deepEqual(submitRows("pick", false), []);
});

test("owner (unlimited) writes no credit rows", () => {
  assert.deepEqual(submitRows("known", true), []);
  assert.deepEqual(submitRows("queued", true), []);
  assert.deepEqual(settleRows({ held: false, found: true, unlimited: true }), []);
  assert.ok(canAfford(0, 1, true));
});

test("can't spend what you don't have", () => {
  assert.ok(canAfford(1, 1, false));
  assert.ok(!canAfford(0, 1, false));
  assert.ok(!canAfford(-1, 1, false));
});

test("refunds are automatic up to 20% of credits used in 90 days", () => {
  assert.ok(!refundIsAutomatic(4, 0), "4 used: 0.8 -> review");
  assert.ok(refundIsAutomatic(5, 0), "5 used: 1 refund");
  assert.ok(!refundIsAutomatic(5, 1), "second refund on 5 -> review");
  assert.ok(refundIsAutomatic(10, 1));
  assert.ok(!refundIsAutomatic(0, 0));
});

test("used and refunded only count rows inside the window", () => {
  const now = Date.parse("2026-09-27T00:00:00Z");
  const since = now - 90 * 86_400_000;
  const old = new Date(since - 1000).toISOString();
  const recent = new Date(now - 1000).toISOString();
  const rows: LedgerRow[] = [
    { delta: -1, reason: "spend", created_at: old },
    { delta: -1, reason: "spend", created_at: recent },
    { delta: -1, reason: "unlock", created_at: recent },
    { delta: -1, reason: "hold", created_at: recent },
    { delta: 1, reason: "refund", created_at: recent },
    { delta: 1, reason: "refund", created_at: old },
  ];
  assert.equal(usedIn(rows, since), 2);
  assert.equal(refundedIn(rows, since), 1);
});

test("credit line in plain words", () => {
  assert.equal(creditLine(3, 0, false), "Finder credits: 3");
  assert.equal(creditLine(3, 2, false), "Finder credits: 3 · 2 held for searches in progress");
  assert.equal(creditLine(0, 0, true), "Finder credits: unlimited (owner)");
});
