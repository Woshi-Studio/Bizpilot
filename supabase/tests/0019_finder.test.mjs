// Database test for 0019_finder.sql: runs the migration (twice) in PGlite, a
// real Postgres compiled to WebAssembly, on top of small stand-ins for the
// Supabase pieces it uses (auth.uid(), roles, businesses, leads). Then it walks
// the credit, worker, pick, bounce, removal and append-only rules.
// Owner checks inside the functions (auth.uid()) are NOT exercised here:
// PGlite's session user is always postgres.
// Run: npm run test:sql
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const MIG = fileURLToPath(new URL("../migrations/0019_finder.sql", import.meta.url));
const db = new PGlite();

const stubs = `
create role anon; create role authenticated; create role service_role; create role authenticator;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create table public.businesses (id uuid primary key default gen_random_uuid(), owner_id uuid, plan text default 'free', created_at timestamptz default now());
create table public.leads (id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null, email text, phone text, message text, status text not null default 'new',
  channel text not null default 'other' check (channel in ('email','upwork','linkedin','freelancer','referral','inbound','other')),
  follow_up_date date, company text, website text, business_line text, created_at timestamptz default now());
create table public.plan_unlimited_businesses (business_id uuid primary key references public.businesses(id) on delete cascade);
`;

async function q(sql, params) {
  const r = await db.query(sql, params);
  return r.rows;
}
async function one(sql, params) {
  return (await q(sql, params))[0];
}
async function fails(sql, params, re) {
  try {
    await db.query(sql, params);
  } catch (e) {
    if (re) assert.match(e.message, re);
    return e.message;
  }
  throw new Error("expected failure: " + sql);
}

await db.exec(stubs);
const mig = readFileSync(MIG, "utf8");
await db.exec(mig);
await db.exec(mig); // safe to run twice
console.log("migration ran twice OK");

const biz = (await one("insert into businesses (owner_id) values (gen_random_uuid()) returning id")).id;
const owner = (await one("insert into businesses (owner_id) values (gen_random_uuid()) returning id")).id;
await q("insert into plan_unlimited_businesses values ($1)", [owner]);
const prof = (await one(
  "insert into finder_profiles (business_id, my_business, offer, aup_version, needs, aup_accepted_at) values ($1,'Web studio','Websites','2026-09-27', '{phone,website}', '2000-01-01') returning id, aup_accepted_at",
  [biz]
));
assert.ok(new Date(prof.aup_accepted_at).getFullYear() > 2020, "aup time set by db");
const worker = (await one("insert into finder_workers (business_id, name, key_prefix, key_hash) values ($1,'Zilla','abcdefgh',repeat('a',64)) returning id", [owner])).id;

const submit = (company, city, website, unlimited = false, b = biz, p = prof.id) =>
  one("select finder_submit($1,$2,'single',$3,$4,$5,null,'CA',$6) as r", [b, p, company, city, website, unlimited]).then((x) => x.r);

// no credits
await fails("select finder_submit($1,$2,'single','Acme','Toronto',null,null,'CA',false)", [biz, prof.id], /finder:no_credits/);
// grant
assert.equal((await one("select finder_beta_grant($1, 10) as n", [biz])).n, 10);
assert.equal((await one("select finder_beta_grant($1, 10) as n", [biz])).n, 10, "grant once");

// unknown -> queued + hold
let r = await submit("Acme Plumbing Inc.", "Toronto", null);
assert.equal(r.status, "queued");
assert.equal((await one("select finder_balance($1) as b", [biz])).b, 9);
const item1 = r.item_id;

// bad kind
await fails("select finder_submit($1,$2,'list','Acme','Toronto',null,null,'CA',false)", [biz, prof.id], /finder:kind/);
await fails("select finder_submit($1,$2,'single','Acme','Toronto','not a url!',null,'CA',false)", [biz, prof.id], /finder:bad_input/);

// worker claims
let claimed = (await one("select finder_worker_claim($1, 3) as c", [worker])).c;
assert.equal(claimed.length, 1);
assert.equal(claimed[0].item_id, item1);
assert.deepEqual(claimed[0].needs, ["phone", "website"]);
assert.equal((await one("select finder_worker_heartbeat($1, $2) as n", [worker, [item1]])).n, 1);
await fails("select finder_worker_complete(gen_random_uuid(), $1, '{\"outcome\":\"found\"}')", [item1], /finder:not_yours/);

const payload = {
  outcome: "found",
  company: { name: "Acme Plumbing", website: "https://www.acmeplumbing.example/", city: "Toronto", country: "CA", source_url: "https://www.acmeplumbing.example/" },
  contacts: [
    { kind: "phone", value: "+1 416-555-0100", source_url: "https://www.acmeplumbing.example/contact", checks: { format: true, on_site: "2026-09-27" }, quality: 70 },
    { kind: "email", value: "Info@AcmePlumbing.example", source_url: "https://www.acmeplumbing.example/contact", checks: { format: true, mx: true }, role_address: true },
    { kind: "contact_form", value: "https://www.acmeplumbing.example/contact", source_url: "https://www.acmeplumbing.example/contact" },
    { kind: "email", value: "nosource@x.example", source_url: "ftp://nope" },
  ],
  why: "Plumber in Toronto",
};
r = (await one("select finder_worker_complete($1, $2, $3) as r", [worker, item1, JSON.stringify(payload)])).r;
assert.equal(r.status, "found");
const res1 = await one("select * from finder_results where id = $1", [r.result_id]);
assert.equal(res1.phone, "+1 416-555-0100");
assert.equal(res1.email, "Info@AcmePlumbing.example");
assert.equal(res1.website, "https://www.acmeplumbing.example/");
assert.equal((await one("select count(*)::int n from kb_contacts")).n, 3, "bad source url skipped");
assert.equal((await one("select finder_balance($1) as b", [biz])).b, 9, "hold released, 1 spent");
const reasons = (await q("select reason, delta from finder_credit_ledger where business_id=$1 order by id", [biz])).map((x) => `${x.reason}${x.delta}`);
assert.deepEqual(reasons, ["grant10", "hold-1", "release1", "spend-1"]);
const job1 = await one("select j.* from finder_jobs j join finder_job_items i on i.job_id=j.id where i.id=$1", [item1]);
assert.equal(job1.status, "done");
assert.equal(job1.credits_held, 0);
assert.equal(job1.credits_spent, 1);

// known: instant by website
r = await submit("whatever", null, "acmeplumbing.example/about");
assert.equal(r.status, "found");
assert.equal((await one("select finder_balance($1) as b", [biz])).b, 8);
// known: instant by name + city
r = await submit("ACME Plumbing", "toronto", null);
assert.equal(r.status, "found");
assert.equal((await one("select finder_balance($1) as b", [biz])).b, 7);

// owner: unlimited, no ledger rows
const oprof = (await one("insert into finder_profiles (business_id, my_business, offer, aup_version) values ($1,'x','y','v1') returning id", [owner])).id;
r = await submit("Acme Plumbing", "Toronto", null, false, owner, oprof);
assert.equal(r.status, "found");
assert.equal((await one("select count(*)::int n from finder_credit_ledger where business_id=$1", [owner])).n, 0);

// two kb companies same name -> pick
await q("insert into kb_companies (name, name_norm, city, city_norm, source_url) values ('Bolt Cafe','boltcafe','Ottawa','ottawa','https://a.example'),('Bolt CafÃ© Ltd','boltcafe','Ottawa','ottawa','https://b.example')");
await q("insert into kb_contacts (company_id, kind, value, value_norm, source_url) select id, 'phone', '613-555-01'||row_number() over (), '61355501'||row_number() over (), source_url from kb_companies where name_norm='boltcafe'");
r = await submit("Bolt Cafe", "Ottawa", null);
assert.equal(r.status, "pick");
assert.equal(r.candidates.length, 2);
assert.equal((await one("select finder_balance($1) as b", [biz])).b, 7, "pick is free");
let p = (await one("select finder_pick($1, 0) as r", [r.item_id])).r;
assert.equal(p.status, "found");
assert.equal((await one("select finder_balance($1) as b", [biz])).b, 6);
await fails("select finder_pick($1, 0)", [r.item_id], /finder:not_pickable/);
// none of these -> queued + hold
r = await submit("Bolt Cafe", "Ottawa", null);
p = (await one("select finder_pick($1, -1) as r", [r.item_id])).r;
assert.equal(p.status, "queued");
assert.equal((await one("select finder_balance($1) as b", [biz])).b, 5);
// worker: ambiguous, then user picks a worker candidate -> queued again, then not found -> release
claimed = (await one("select finder_worker_claim($1, 1) as c", [worker])).c;
assert.equal(claimed.length, 1);
r = (await one("select finder_worker_complete($1,$2,$3) as r", [worker, claimed[0].item_id, JSON.stringify({ outcome: "ambiguous", candidates: [{ name: "Bolt Cafe East", city: "Ottawa", website: "https://bolteast.example" }, { name: "Bolt Cafe West", city: "Ottawa" }] })])).r;
assert.equal(r.status, "ambiguous");
p = (await one("select finder_pick($1, 0) as r", [claimed[0].item_id])).r;
assert.equal(p.status, "queued");
assert.equal((await one("select website from finder_job_items where id=$1", [claimed[0].item_id])).website, "https://bolteast.example");
claimed = (await one("select finder_worker_claim($1, 1) as c", [worker])).c;
r = (await one("select finder_worker_complete($1,$2,'{\"outcome\":\"not_found\",\"note\":\"no site\"}') as r", [worker, claimed[0].item_id])).r;
assert.equal(r.status, "not_found");
assert.equal((await one("select finder_balance($1) as b", [biz])).b, 6, "not found = free");

// found but everything suppressed -> not found, nothing kept
r = await submit("Hidden Co", "Calgary", "hidden.example");
await q("insert into kb_suppression (kind, value_norm) values ('domain','hidden.example')");
claimed = (await one("select finder_worker_claim($1, 1) as c", [worker])).c;
r = (await one("select finder_worker_complete($1,$2,$3) as r", [worker, claimed[0].item_id, JSON.stringify({ outcome: "found", company: { name: "Hidden Co", website: "https://hidden.example", source_url: "https://hidden.example" }, contacts: [{ kind: "phone", value: "403 555 0100", source_url: "https://hidden.example" }] })])).r;
assert.equal(r.status, "not_found");
assert.equal((await one("select count(*)::int n from kb_companies where domain='hidden.example'")).n, 0);

// stale claim goes back to the queue
r = await submit("Slow Co", "Calgary", null);
claimed = (await one("select finder_worker_claim($1, 1) as c", [worker])).c;
await q("update finder_job_items set heartbeat_at = now() - interval '20 minutes' where id = $1", [claimed[0].item_id]);
claimed = (await one("select finder_worker_claim($1, 1) as c", [worker])).c;
assert.equal(claimed.length, 1, "requeued and reclaimed");
assert.equal((await one("select attempts from finder_job_items where id=$1", [claimed[0].item_id])).attempts, 2);

// add to leads
const lead = (await one("select finder_add_to_lead($1) as id", [res1.id])).id;
const L = await one("select * from leads where id=$1", [lead]);
assert.equal(L.channel, "finder");
assert.equal(L.finder_result_id, res1.id);
assert.ok(L.verified_at);
assert.equal((await one("select finder_add_to_lead($1) as id", [res1.id])).id, lead, "idempotent");

// bounce: spent in 90 days = 4 -> (0+1)*5 <= 4 false -> review
r = (await one("select finder_report_bounce($1,'bounce','came back') as r", [res1.id])).r;
assert.equal(r.status, "review");
await fails("select finder_report_bounce($1,'bounce',null)", [res1.id], /finder:already_reported/);
assert.equal((await one("select bad_reports from kb_contacts where kind='email'")).bad_reports, 1);

// ledger append-only
await fails("update finder_credit_ledger set delta = 100 where business_id = $1", [biz], /append-only/);
await fails("delete from finder_credit_ledger where business_id = $1", [biz], /append-only/);

// locked result check
await fails("insert into finder_results (business_id, company_name, locked, phone) values ($1,'x',true,'1')", [biz], /finder_results_locked_empty/);

// removal request
const tok = "b".repeat(64);
await q("select removal_request_create('Info@acmeplumbing.example','Acme Plumbing','https://acmeplumbing.example','416 555 0100',null,$1,$2)", [tok, "c".repeat(64)]);
r = (await one("select removal_request_verify($1) as r", [tok])).r;
assert.equal(r.status, "done");
assert.equal(r.companies, 1);
assert.equal((await one("select count(*)::int n from kb_companies where domain='acmeplumbing.example'")).n, 0);
assert.equal((await one("select count(*)::int n from kb_suppression where request_id is not null")).n, 4);
assert.equal((await one("select removal_request_verify($1) as r", [tok])).r.status, "done", "repeat is fine");
assert.equal((await one("select removal_request_verify($1) as r", ["d".repeat(64)])).r.status, "unknown");
for (let i = 0; i < 3; i++) await q("select removal_request_create('x@y.example',null,null,null,null,$1,null)", [String(i).repeat(64).slice(0, 64).replace(/./g, String(i))]);
await fails("select removal_request_create('x@y.example',null,null,null,null,$1,null)", ["e".repeat(64)], /removal:rate/);

// norms
assert.equal((await one("select finder_norm_company('The Acme & Sons, Inc.') v")).v, "acmeandsons");
assert.equal((await one("select finder_norm_domain('HTTPS://www.Acme.example:8080/x?y') v")).v, "acme.example");
assert.equal((await one("select finder_norm_phone('+1 (416) 555-0100') v")).v, "4165550100");

// lookup
r = (await one("select finder_worker_lookup(null,'Bolt Cafe','Ottawa') as r")).r;
assert.equal(r.servable, true);

// business delete cascades through the append-only ledger
await q("delete from businesses where id = $1", [biz]);
assert.equal((await one("select count(*)::int n from finder_credit_ledger where business_id=$1", [biz])).n, 0);

console.log("ALL SQL CHECKS PASSED");

