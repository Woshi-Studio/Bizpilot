// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balanceOf,
  canAfford,
  grantRows,
  poolLeft,
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
  assert.equal(creditLine(3, 0, false), "Lead credits: 3");
  assert.equal(creditLine(3, 2, false), "Lead credits: 3 · 2 held for searches in progress");
  assert.equal(creditLine(0, 0, true), "Lead credits: unlimited (owner)");
});

test("grants: the same Stripe invoice twice adds credits once", () => {
  const seen = new Set<string>();
  const rows: LedgerRow[] = [];
  const a = grantRows(rows, seen, { pool: "plan", credits: 40, ref: "in:1:plan", rollover: false });
  rows.push(...a.rows);
  const b = grantRows(rows, seen, { pool: "plan", credits: 40, ref: "in:1:plan", rollover: false });
  assert.equal(a.status, "granted");
  assert.equal(b.status, "duplicate");
  assert.equal(b.rows.length, 0);
  assert.equal(balanceOf(rows), 40);
  rows.push(...grantRows(rows, seen, { pool: "pack", credits: 25, ref: "cs:1", rollover: false }).rows);
  rows.push(...grantRows(rows, seen, { pool: "pack", credits: 25, ref: "cs:1", rollover: false }).rows);
  assert.equal(balanceOf(rows), 65, "one pack session = one grant");
});

test("no rollover: a new 4-week grant removes what is left of the last one; packs stay", () => {
  const seen = new Set<string>();
  const rows: LedgerRow[] = [];
  const add = (g: Parameters<typeof grantRows>[2]) => {
    const out = grantRows(rows, seen, g);
    rows.push(...out.rows);
    return out;
  };
  add({ pool: "plan", credits: 40, ref: "in:1", rollover: false });
  add({ pool: "pack", credits: 25, ref: "cs:1", rollover: false });
  rows.push({ delta: -1, reason: "spend" });
  rows.push({ delta: -1, reason: "hold", item_id: "i1" }, { delta: 1, reason: "release", item_id: "i1" }, { delta: -1, reason: "spend", item_id: "i1" });
  assert.equal(balanceOf(rows), 63);
  assert.equal(poolLeft(rows, "plan"), 38, "spends come out of the plan grant first");
  const next = add({ pool: "plan", credits: 40, ref: "in:2", rollover: false });
  assert.equal(next.expired, 38);
  assert.equal(balanceOf(rows), 65, "40 new + 25 pack; the 38 left over are gone");
  add({ pool: "leadsub", credits: 100, ref: "in:3", rollover: false });
  assert.equal(poolLeft(rows, "leadsub"), 100);
  assert.equal(add({ pool: "leadsub", credits: 100, ref: "in:4", rollover: false }).expired, 100);
  assert.equal(balanceOf(rows), 165);
  assert.equal(add({ pool: "plan", credits: 40, ref: "in:5", rollover: true }).expired, 0, "rollover on: nothing expires");
  assert.equal(balanceOf(rows), 205);
  assert.equal(add({ pool: "leadsub", credits: 0, ref: "end:1", rollover: false }).expired, 100, "sub ended");
  assert.equal(balanceOf(rows), 105);
});
