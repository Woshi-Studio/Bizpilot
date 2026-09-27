// Lead Finder credits: the same math as the database (0019_finder.sql).
// The database is the real wall; this file is for display and tests.
//
//   balance = sum(delta) over every ledger row
//   known company (in our records)  -> spend 1 at once
//   needs research                  -> hold 1; when done: release 1, and
//                                      spend 1 only if something was found
//   not found                       -> free
//   owner (unlimited)               -> no rows at all
//   bounce / wrong number refund    -> automatic while refunds stay within
//                                      20% of the credits used in 90 days

export type LedgerReason = "grant" | "hold" | "release" | "spend" | "refund" | "unlock" | "adjust";

export type LedgerRow = {
  delta: number;
  reason: LedgerReason;
  created_at?: string;
  item_id?: string | null;
};

export function balanceOf(rows: LedgerRow[]): number {
  return rows.reduce((n, r) => n + (Number.isFinite(r.delta) ? r.delta : 0), 0);
}

// Credits currently held for searches still being researched.
export function heldOf(rows: LedgerRow[]): number {
  const perItem = new Map<string, number>();
  for (const r of rows) {
    if (!r.item_id) continue;
    if (r.reason === "hold") perItem.set(r.item_id, (perItem.get(r.item_id) ?? 0) + 1);
    if (r.reason === "release") perItem.set(r.item_id, (perItem.get(r.item_id) ?? 0) - 1);
  }
  let held = 0;
  for (const n of perItem.values()) held += Math.max(0, n);
  return held;
}

export function canAfford(balance: number, cost: number, unlimited: boolean): boolean {
  return unlimited || balance >= cost;
}

export type SearchOutcome = "known" | "pick" | "queued";

// Ledger rows written when a search is submitted.
export function submitRows(outcome: SearchOutcome, unlimited: boolean): LedgerRow[] {
  if (unlimited) return [];
  if (outcome === "known") return [{ delta: -1, reason: "spend" }];
  if (outcome === "queued") return [{ delta: -1, reason: "hold" }];
  return [];
}

// Ledger rows written when a researched item ends.
export function settleRows(opts: { held: boolean; found: boolean; unlimited: boolean }): LedgerRow[] {
  const rows: LedgerRow[] = [];
  if (opts.held) rows.push({ delta: 1, reason: "release" });
  if (opts.found && !opts.unlimited) rows.push({ delta: -1, reason: "spend" });
  return rows;
}

// Credits used in the window: spends and unlocks (positive number).
export function usedIn(rows: LedgerRow[], sinceMs: number): number {
  return rows
    .filter((r) => (r.reason === "spend" || r.reason === "unlock") && inWindow(r, sinceMs))
    .reduce((n, r) => n - r.delta, 0);
}

export function refundedIn(rows: LedgerRow[], sinceMs: number): number {
  return rows.filter((r) => r.reason === "refund" && inWindow(r, sinceMs)).reduce((n, r) => n + r.delta, 0);
}

function inWindow(r: LedgerRow, sinceMs: number) {
  if (!r.created_at) return true;
  return new Date(r.created_at).getTime() > sinceMs;
}

// One more refund stays within 20% of what was used: (refunded + 1) * 5 <= used.
export function refundIsAutomatic(used90: number, refunded90: number): boolean {
  return (refunded90 + 1) * 5 <= used90;
}

export function creditLine(balance: number, held: number, unlimited: boolean): string {
  if (unlimited) return "Finder credits: unlimited (owner)";
  const heldText = held > 0 ? ` · ${held} held for searches in progress` : "";
  return `Finder credits: ${balance}${heldText}`;
}
