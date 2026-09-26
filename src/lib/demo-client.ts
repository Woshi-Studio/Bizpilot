// A tiny in-memory stand-in for the Supabase client, used ONLY in DEMO
// MODE (see demo.ts). It answers the read queries the pages make with the
// fake rows in demo-data.ts. Writes succeed but change nothing.
//
// createDemoClient() refuses to run outside demo mode.

import { isDemoMode, DEMO_USER_ID } from "./demo.ts";
import { buildDemoData, demoScoreboard, type Row } from "./demo-data.ts";

type Filter = (row: Row) => boolean;
type Result = { data: unknown; error: null | { message: string; code?: string }; count?: number | null };

const singular = (table: string) => table.replace(/s$/, "");

function cmp(a: unknown, b: unknown) {
  if (typeof a === "number" || typeof b === "number") return Number(a) - Number(b);
  return String(a).localeCompare(String(b));
}

// Splits "a, b, customers(name, email), invoice_items(*)" at top-level commas.
function embeds(select: string): { table: string }[] {
  const out: { table: string }[] = [];
  const re = /([a-z_]+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(select))) out.push({ table: m[1] });
  return out;
}

class Query implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private max: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private selectStr = "*";
  private countMode = false;
  private head = false;
  private write: "insert" | "update" | "delete" | "upsert" | null = null;
  private payload: unknown = null;

  private db: Record<string, Row[]>;
  private table: string;

  constructor(db: Record<string, Row[]>, table: string) {
    this.db = db;
    this.table = table;
  }

  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    this.selectStr = cols;
    if (opts?.count) this.countMode = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(p: unknown) { this.write = "insert"; this.payload = p; return this; }
  upsert(p: unknown) { this.write = "upsert"; this.payload = p; return this; }
  update(p: unknown) { this.write = "update"; this.payload = p; return this; }
  delete() { this.write = "delete"; return this; }

  eq(c: string, v: unknown) { this.filters.push((r) => r[c] !== null && r[c] !== undefined && String(r[c]) === String(v)); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => String(r[c]) !== String(v)); return this; }
  gt(c: string, v: unknown) { this.filters.push((r) => r[c] != null && cmp(r[c], v) > 0); return this; }
  gte(c: string, v: unknown) { this.filters.push((r) => r[c] != null && cmp(r[c], v) >= 0); return this; }
  lt(c: string, v: unknown) { this.filters.push((r) => r[c] != null && cmp(r[c], v) < 0); return this; }
  lte(c: string, v: unknown) { this.filters.push((r) => r[c] != null && cmp(r[c], v) <= 0); return this; }
  is(c: string, v: null) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  in(c: string, vals: unknown[]) { this.filters.push((r) => vals.map(String).includes(String(r[c]))); return this; }
  ilike(c: string, pattern: string) {
    const p = pattern.replace(/\\/g, "").toLowerCase().replace(/%/g, "");
    this.filters.push((r) => String(r[c] ?? "").toLowerCase().includes(p));
    return this;
  }
  like(c: string, pattern: string) { return this.ilike(c, pattern); }
  not(c: string, op: string, v: unknown) {
    if (op === "is") this.filters.push((r) => (r[c] ?? null) !== v);
    else if (op === "in") {
      const list = String(v).replace(/[()]/g, "").split(",").map((s) => s.trim());
      this.filters.push((r) => !list.includes(String(r[c])));
    } else if (op === "eq") this.filters.push((r) => String(r[c]) !== String(v));
    return this;
  }
  or() { return this; }
  filter() { return this; }
  match(obj: Record<string, unknown>) { for (const [k, v] of Object.entries(obj)) this.eq(k, v); return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.orders.push({ col, asc: opts?.ascending !== false }); return this; }
  limit(n: number) { this.max = n; return this; }
  range(from: number, to: number) { this.max = to - from + 1; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  abortSignal() { return this; }

  private run(): Result {
    if (this.write) {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      const data = (rows as Row[]).map((r, i) => ({ id: `00000000-0000-4000-8000-00000000${String(9000 + i)}`, ...(r ?? {}) }));
      if (this.mode !== "many") return { data: data[0] ?? null, error: null };
      return { data: this.write === "delete" ? null : data, error: null };
    }

    let rows = (this.db[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)));
    for (const o of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const av = a[o.col], bv = b[o.col];
        if (av == null && bv == null) return 0;
        if (av == null) return 1; // nulls last
        if (bv == null) return -1;
        return o.asc ? cmp(av, bv) : -cmp(av, bv);
      });
    }
    const total = rows.length;
    if (this.max != null) rows = rows.slice(0, this.max);

    // Embedded relations: customers(name) -> row.customers = {…};
    // invoice_items(*) -> row.invoice_items = [...]
    const rels = embeds(this.selectStr);
    if (rels.length) {
      rows = rows.map((r) => {
        const out: Row = { ...r };
        for (const { table } of rels) {
          const fk = `${singular(table)}_id`;
          if (fk in r) {
            out[table] = (this.db[table] ?? []).find((x) => x.id === r[fk]) ?? null;
          } else {
            const back = `${singular(this.table)}_id`;
            out[table] = (this.db[table] ?? []).filter((x) => x[back] === r.id);
          }
        }
        return out;
      });
    }

    if (this.head) return { data: null, error: null, count: total };
    if (this.mode === "single") {
      return rows[0]
        ? { data: rows[0], error: null }
        : { data: null, error: { message: "no rows (demo)", code: "PGRST116" } };
    }
    if (this.mode === "maybe") return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null, count: this.countMode ? total : null };
  }

  then<A = Result, B = never>(
    ok?: ((v: Result) => A | PromiseLike<A>) | null,
    fail?: ((e: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(ok, fail);
  }
}

export function createDemoClient() {
  if (!isDemoMode()) {
    throw new Error("Demo client requested outside DEMO MODE");
  }
  const db = buildDemoData();
  const user = { id: DEMO_USER_ID, email: "maya@example.com", user_metadata: { full_name: "Maya Torres" } };

  const storageBucket = {
    upload: async () => ({ data: { path: "demo" }, error: null }),
    remove: async () => ({ data: [], error: null }),
    createSignedUrl: async () => ({ data: { signedUrl: "#" }, error: null }),
    createSignedUrls: async () => ({ data: [], error: null }),
    download: async () => ({ data: null, error: { message: "demo" } }),
  };

  const client = {
    from: (table: string) => new Query(db, table),
    rpc: async (fn: string) => {
      if (fn === "owner_hub_scoreboard") return { data: demoScoreboard(db), error: null };
      if (fn === "consume_ai_credit") return { data: { allowed: true, used: 8, limit: 100 }, error: null };
      if (fn === "consume_email_send") return { data: { allowed: true, used: 3, limit: 50 }, error: null };
      if (fn === "shared_invoice") {
        const inv = (db.invoices ?? [])[0];
        if (!inv) return { data: null, error: null };
        const biz = (db.businesses ?? [])[0] ?? {};
        const cust = (db.customers ?? []).find((c) => c.id === inv.customer_id);
        return {
          data: {
            number: inv.number, doc_type: inv.doc_type, status: inv.status,
            issue_date: inv.issue_date, due_date: inv.due_date, notes: inv.notes ?? "Interac e-Transfer: maya@example.com",
            currency: "CAD", tax_label: "HST", tax_rate: 13,
            business_name: biz.name, owner_name: "Maya Torres",
            customer_name: cust?.name ?? null, customer_company: cust?.company ?? null,
            items: (db.invoice_items ?? []).filter((i) => i.invoice_id === inv.id),
          },
          error: null,
        };
      }
      if (fn === "plan_usage") {
        const count = (t: string) => (db[t] ?? []).length;
        const openLeads = (db.leads ?? []).filter((l) => l.status !== "converted").length;
        return {
          data: {
            contacts: count("customers") + openLeads,
            docs_28d: Math.min(count("invoices"), 7),
            storage_bytes: 31_457_280,
            email_today: 3,
            business_lines: 1,
          },
          error: null,
        };
      }
      return { data: null, error: { message: `rpc ${fn} not in demo` } };
    },
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signOut: async () => ({ error: null }),
      updateUser: async () => ({ data: { user }, error: null }),
      signInWithPassword: async () => ({ data: { user }, error: null }),
      signUp: async () => ({ data: { user }, error: null }),
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      exchangeCodeForSession: async () => ({ data: {}, error: null }),
    },
    storage: { from: () => storageBucket },
  };
  return client;
}
