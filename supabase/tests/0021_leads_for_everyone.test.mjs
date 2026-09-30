// Database test for 0021_leads_for_everyone.sql: runs 0019, 0020, then 0021
// (twice) in PGlite. Walks: the welcome grant (5, once per business, never
// the owner), a Starter with credits searching in 'full' mode (spends,
// unlocked), a Starter unlocking a SAVED locked result for 1 credit, no
// credits = finder:no_credits, Boss still unlocks free, service role only.
// Run: npm run test:sql
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const mig = (n) => readFileSync(fileURLToPath(new URL(`../migrations/${n}`, import.meta.url)), "utf8");
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

const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
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
await db.exec(mig("0019_finder.sql"));
await db.exec(mig("0020_finder_plans.sql"));
const mig21 = mig("0021_leads_for_everyone.sql");
await db.exec(mig21);
await db.exec(mig21); // safe to run twice
console.log("0019 + 0020 + 0021 (twice) ran OK");

const newBiz = async (plan) => (await one("insert into businesses (owner_id, plan) values (gen_random_uuid(), $1) returning id", [plan])).id;
const newProfile = async (b) =>
  (await one("insert into finder_profiles (business_id, my_business, offer, aup_version, needs) values ($1,'Studio','Sites','2026-09-27','{phone,website}') returning id", [b])).id;
const balance = async (b) => (await one("select finder_balance($1) as b", [b])).b;
const grant = (b, pool, credits, ref) =>
  one("select finder_grant($1,$2,$3,$4,false) as r", [b, pool, credits, ref]).then((x) => x.r);
const submit = (b, p, company, city, website, mode) =>
  one("select finder_submit($1,$2,'single',$3::jsonb,$4,5) as r", [
    b, p, JSON.stringify({ country: "CA", kind: website ? "domain" : "company", company, city, website }), mode,
  ]).then((x) => x.r);
const unlockPaid = (b, r) => one("select finder_unlock_paid($1,$2) as r", [b, r]).then((x) => x.r);

const ownerBiz = await newBiz("free");
await q("insert into plan_unlimited_businesses values ($1)", [ownerBiz]);

// Two known companies in the shared records
await q(`insert into kb_companies (name, name_norm, city, city_norm, website, domain, address, source_url) values
  ('Acme Plumbing','acmeplumbing','Toronto','toronto','https://acme.example/','acme.example','1 Main St','https://acme.example/'),
  ('Bolt Cafe','boltcafe','Ottawa','ottawa','https://bolt.example/','bolt.example','2 Bank St','https://bolt.example/')`);
await q(`insert into kb_contacts (company_id, kind, value, value_norm, source_url)
  select id, 'phone', '416-555-0100', '4165550100', source_url from kb_companies where name_norm='acmeplumbing'
  union all
  select id, 'phone', '613-555-0199', '6135550199', source_url from kb_companies where name_norm='boltcafe'`);

// ------------------------------------------------------------------
// Welcome credits: 5, once per business (same ref twice = once)
// ------------------------------------------------------------------
const starter = await newBiz("free");
const sp = await newProfile(starter);
const ref = `welcome:${starter}`;
let g = await grant(starter, "pack", 5, ref);
assert.equal(g.status, "granted");
assert.equal(await balance(starter), 5);
g = await grant(starter, "pack", 5, ref);
assert.equal(g.status, "duplicate", "a second welcome adds nothing");
assert.equal(await balance(starter), 5);
assert.equal((await one("select count(*)::int n from finder_audit where business_id=$1 and action='grant'", [starter])).n, 1, "logged like other grants");
assert.equal((await grant(ownerBiz, "pack", 5, `welcome:${ownerBiz}`)).status, "owner", "the owner gets no rows");
assert.equal((await one("select count(*)::int n from finder_credit_ledger where business_id=$1", [ownerBiz])).n, 0);

// ------------------------------------------------------------------
// A locked search saved before the credits: stays locked, free
// ------------------------------------------------------------------
let r = await submit(starter, sp, "Acme Plumbing", "Toronto", null, "locked");
assert.equal(r.status, "found");
assert.equal(r.locked, true);
const lockedId = r.result_id;
assert.equal(await balance(starter), 5, "locked search is free");

// Starter with credits searches in 'full' mode: 1 credit, unlocked
r = await submit(starter, sp, "Bolt Cafe", "Ottawa", null, "full");
assert.equal(r.status, "found");
assert.equal(r.locked, false);
let res = await one("select * from finder_results where id=$1", [r.result_id]);
assert.equal(res.phone, "613-555-0199");
assert.equal(await balance(starter), 4);

// Old finder_unlock still refuses Starter (free unlock is Boss only)
await fails("select finder_unlock($1)", [lockedId], /finder:upgrade/);

// Paid unlock of the saved locked result: 1 credit, contacts filled
r = await unlockPaid(starter, lockedId);
assert.equal(r.status, "unlocked");
assert.equal(r.credits, 1);
res = await one("select * from finder_results where id=$1", [lockedId]);
assert.equal(res.locked, false);
assert.equal(res.phone, "416-555-0100");
assert.equal(res.website, "https://acme.example/");
assert.equal(res.address, "1 Main St");
assert.ok(res.source_urls.length >= 1);
assert.equal(await balance(starter), 3);
const spend = await one("select delta, reason, note from finder_credit_ledger where business_id=$1 and result_id=$2 and reason='spend'", [starter, lockedId]);
assert.deepEqual(spend, { delta: -1, reason: "spend", note: "unlock" }, "a spend tied to the result (fair credits + refunds see it)");

// Again: already unlocked, no second charge
r = await unlockPaid(starter, lockedId);
assert.equal(r.credits, 0);
assert.equal(await balance(starter), 3);

// Someone else's result: not found, nothing spent
const other = await newBiz("free");
await grant(other, "pack", 5, `welcome:${other}`);
await fails("select finder_unlock_paid($1,$2)", [other, lockedId], /finder:not_found/);
assert.equal(await balance(other), 5);

// No credits: finder:no_credits, stays locked
const hustle = await newBiz("premium");
const hp = await newProfile(hustle);
r = await submit(hustle, hp, "Acme Plumbing", "Toronto", null, "locked");
const hLocked = r.result_id;
await fails("select finder_unlock_paid($1,$2)", [hustle, hLocked], /finder:no_credits/);
assert.equal((await one("select locked from finder_results where id=$1", [hLocked])).locked, true);
// A pack later: unlocks for 1
await grant(hustle, "pack", 25, "cs:test_pack_1");
r = await unlockPaid(hustle, hLocked);
assert.equal(r.credits, 1);
assert.equal(await balance(hustle), 24);

// Boss unlocks free through the same call
const boss = await newBiz("pro");
const bp = await newProfile(boss);
await q("update businesses set plan='free' where id=$1", [boss]);
r = await submit(boss, bp, "Bolt Cafe", "Ottawa", null, "locked");
const bLocked = r.result_id;
await q("update businesses set plan='pro' where id=$1", [boss]);
r = await unlockPaid(boss, bLocked);
assert.equal(r.status, "unlocked");
assert.equal(r.credits, 0);
assert.equal(await balance(boss), 0, "Boss unlock is free");

// Service role only
const priv = await one(
  "select has_function_privilege('authenticated', 'public.finder_unlock_paid(uuid, uuid)', 'execute') a, has_function_privilege('service_role', 'public.finder_unlock_paid(uuid, uuid)', 'execute') s"
);
assert.equal(priv.a, false);
assert.equal(priv.s, true);

console.log("0021 leads for everyone: all checks passed");
