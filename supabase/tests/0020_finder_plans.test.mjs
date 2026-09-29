// Database test for 0020_finder_plans.sql: runs 0019 then 0020 (twice) in
// PGlite (real Postgres in WebAssembly) on small stand-ins for the Supabase
// pieces. Walks: locked results for Starter/Hustle, unlock on upgrade to Boss,
// credit grants (idempotent per Stripe id), no rollover, packs, the owner.
// Run: npm run test:sql
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const MIG19 = fileURLToPath(new URL("../migrations/0019_finder.sql", import.meta.url));
const MIG20 = fileURLToPath(new URL("../migrations/0020_finder_plans.sql", import.meta.url));
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
await db.exec(readFileSync(MIG19, "utf8"));
const mig20 = readFileSync(MIG20, "utf8");
await db.exec(mig20);
await db.exec(mig20); // safe to run twice
await db.exec(readFileSync(MIG19, "utf8")); // 0019 again after 0020 (a re-paste) must not break it
await db.exec(mig20);
console.log("0019 + 0020 ran (twice) OK");

const newBiz = async (plan) => (await one("insert into businesses (owner_id, plan) values (gen_random_uuid(), $1) returning id", [plan])).id;
const newProfile = async (b) =>
  (await one("insert into finder_profiles (business_id, my_business, offer, aup_version, needs) values ($1,'Studio','Sites','2026-09-27','{phone,website}') returning id", [b])).id;
const balance = async (b) => (await one("select finder_balance($1) as b", [b])).b;
const rows = async (b) => (await one("select count(*)::int n from finder_credit_ledger where business_id=$1", [b])).n;
const submitQ = (b, p, query, mode, cap = 5) =>
  one("select finder_submit($1,$2,'single',$3::jsonb,$4,$5) as r", [b, p, JSON.stringify({ country: "CA", ...query }), mode, cap]).then((x) => x.r);
const submit = (b, p, company, city, website, mode, cap = 5) =>
  submitQ(b, p, { kind: website ? "domain" : "company", company, city, website }, mode, cap);
const grant = (b, pool, credits, ref, rollover = false) =>
  one("select finder_grant($1,$2,$3,$4,$5) as r", [b, pool, credits, ref, rollover]).then((x) => x.r);
const poolLeft = async (b, pool) => (await one("select finder_pool_left($1,$2) as n", [b, pool])).n;

const ownerBiz = await newBiz("free");
await q("insert into plan_unlimited_businesses values ($1)", [ownerBiz]);
const worker = (await one("insert into finder_workers (business_id, name, key_prefix, key_hash) values ($1,'Zilla','abcdefgh',repeat('a',64)) returning id", [ownerBiz])).id;

// ------------------------------------------------------------------
// Starter: searches run, results come back locked, no credits used
// ------------------------------------------------------------------
const starter = await newBiz("free");
const sp = await newProfile(starter);

let r = await submit(starter, sp, "Acme Plumbing", "Toronto", "acmeplumbing.example", "locked");
assert.equal(r.status, "queued");
assert.equal(r.locked, true);
assert.equal(await rows(starter), 0, "locked search holds nothing");

let claimed = (await one("select finder_worker_claim($1, 1) as c", [worker])).c;
assert.equal(claimed.length, 1);
const payload = {
  outcome: "found",
  company: { name: "Acme Plumbing", website: "https://acmeplumbing.example/", city: "Toronto", country: "CA", address: "1 Main St", source_url: "https://acmeplumbing.example/" },
  contacts: [
    { kind: "phone", value: "416-555-0100", source_url: "https://acmeplumbing.example/contact", checks: { valid: true } },
    { kind: "email", value: "info@acmeplumbing.example", source_url: "https://acmeplumbing.example/contact", checks: { format: true } },
    { kind: "contact_form", value: "https://acmeplumbing.example/contact", source_url: "https://acmeplumbing.example/contact" },
  ],
  why: "Plumber in Toronto, no booking page",
};
r = (await one("select finder_worker_complete($1,$2,$3) as r", [worker, claimed[0].item_id, JSON.stringify(payload)])).r;
assert.equal(r.status, "found");
let res = await one("select * from finder_results where id=$1", [r.result_id]);
assert.equal(res.locked, true);
for (const k of ["phone", "email", "contact_form_url", "website", "address", "phone_checks", "email_checks"]) {
  assert.equal(res[k], null, `locked result holds no ${k}`);
}
assert.deepEqual(res.source_urls, []);
assert.equal(res.company_name, "Acme Plumbing");
assert.equal(res.city, "Toronto");
assert.equal(res.why, "Plumber in Toronto, no booking page");
assert.equal(await rows(starter), 0, "locked search spends nothing");
assert.equal((await one("select count(*)::int n from kb_contacts")).n, 3, "the knowledge base still learns");
const lockedId = res.id;

// Known company, locked: instant, still locked, free
r = await submit(starter, sp, "ACME Plumbing", "toronto", null, "locked");
assert.equal(r.status, "found");
res = await one("select * from finder_results where id=$1", [r.result_id]);
assert.equal(res.locked, true);
assert.equal(res.website, null);
assert.deepEqual(res.source_urls, []);
assert.equal(await rows(starter), 0);

// Can't unlock or add to leads on Starter
await fails("select finder_unlock($1)", [lockedId], /finder:upgrade/);
await fails("select finder_add_to_lead($1)", [lockedId], /finder:locked/);
assert.equal((await one("select finder_unlock_all($1) as n", [starter])).n, 0, "not Boss: nothing unlocked");

// Daily cap on locked searches (cap 3: two used above)
r = await submit(starter, sp, "Third Co", "Ottawa", null, "locked", 3);
assert.equal(r.status, "queued");
await fails("select finder_submit($1,$2,'single','{\"company\":\"Fourth Co\",\"city\":\"Ottawa\"}'::jsonb,'locked',3)", [starter, sp], /finder:locked_cap/);

// A locked row can't hold a website or a source either
await fails("insert into finder_results (business_id, company_name, locked, website) values ($1,'x',true,'https://x.example')", [starter], /finder_results_locked_empty/);
await fails("insert into finder_results (business_id, company_name, locked, source_urls) values ($1,'x',true,'{https://x.example}')", [starter], /finder_results_locked_empty/);

// Hustle is locked too; several known matches -> pick (free) -> locked
const hustle = await newBiz("premium");
const hp = await newProfile(hustle);
await q("insert into kb_companies (name, name_norm, city, city_norm, website, domain, source_url) values ('Bolt Cafe','boltcafe','Ottawa','ottawa','https://a.example','a.example','https://a.example'),('Bolt Cafe Ltd','boltcafe','Ottawa','ottawa','https://b.example','b.example','https://b.example')");
await q("insert into kb_contacts (company_id, kind, value, value_norm, source_url) select id, 'phone', '613-555-01'||row_number() over (), '61355501'||row_number() over (), source_url from kb_companies where name_norm='boltcafe'");
r = await submit(hustle, hp, "Bolt Cafe", "Ottawa", null, "locked");
assert.equal(r.status, "pick");
let p = (await one("select finder_pick($1, 0) as r", [r.item_id])).r;
assert.equal(p.status, "found");
res = await one("select * from finder_results where id=$1", [p.result_id]);
assert.equal(res.locked, true);
assert.equal(res.phone, null);
assert.equal(await rows(hustle), 0);
// "None of these" on a locked job: re-researched free, no hold
r = await submit(hustle, hp, "Bolt Cafe", "Ottawa", null, "locked");
p = (await one("select finder_pick($1, -1) as r", [r.item_id])).r;
assert.equal(p.status, "queued");
assert.equal(await rows(hustle), 0);
assert.equal((await one("select held from finder_job_items where id=$1", [r.item_id])).held, false);

// ------------------------------------------------------------------
// Upgrade to Boss: saved locked results unlock, free
// ------------------------------------------------------------------
await q("update businesses set plan='pro' where id=$1", [starter]);
const unlocked = (await one("select finder_unlock_all($1) as n", [starter])).n;
assert.equal(unlocked, 2);
res = await one("select * from finder_results where id=$1", [lockedId]);
assert.equal(res.locked, false);
assert.equal(res.phone, "416-555-0100");
assert.equal(res.email, "info@acmeplumbing.example");
assert.equal(res.website, "https://acmeplumbing.example/");
assert.equal(res.address, "1 Main St");
assert.ok(res.source_urls.length >= 1);
assert.equal(await rows(starter), 0, "unlock on upgrade is free");
assert.equal((await one("select finder_unlock($1) as r", [lockedId])).r.status, "unlocked", "repeat is fine");

// ------------------------------------------------------------------
// Boss: credits, grants, idempotency, no rollover, packs
// ------------------------------------------------------------------
const boss = await newBiz("pro");
const bp = await newProfile(boss);
await fails("select finder_submit($1,$2,'single','{\"company\":\"Acme Plumbing\",\"city\":\"Toronto\"}'::jsonb,'full',5)", [boss, bp], /finder:no_credits/);

let g = await grant(boss, "plan", 40, "in_1:plan");
assert.equal(g.status, "granted");
assert.equal(await balance(boss), 40);
g = await grant(boss, "plan", 40, "in_1:plan");
assert.equal(g.status, "duplicate", "same invoice twice = one grant");
assert.equal(await balance(boss), 40);

r = await submit(boss, bp, "Acme Plumbing", "Toronto", null, "full");
assert.equal(r.status, "found");
res = await one("select * from finder_results where id=$1", [r.result_id]);
assert.equal(res.locked, false, "Boss search delivers unlocked");
assert.equal(res.phone, "416-555-0100");
assert.equal(await balance(boss), 39);
assert.equal(await poolLeft(boss, "plan"), 39);

// Next 4-week invoice: the 39 left over do NOT carry over
g = await grant(boss, "plan", 40, "in_2:plan");
assert.equal(g.expired, 39);
assert.equal(await balance(boss), 40);
assert.equal(await poolLeft(boss, "plan"), 40);

// Packs never expire; each checkout session counts once
g = await grant(boss, "pack", 25, "cs_1");
assert.equal(g.status, "granted");
g = await grant(boss, "pack", 25, "cs_1");
assert.equal(g.status, "duplicate");
assert.equal(await balance(boss), 65);

// Spending uses the plan grant first, so the pack stays whole
r = await submit(boss, bp, "Acme Plumbing", "Toronto", null, "full");
assert.equal(await balance(boss), 64);
assert.equal(await poolLeft(boss, "plan"), 39);
g = await grant(boss, "plan", 40, "in_3:plan");
assert.equal(g.expired, 39);
assert.equal(await balance(boss), 65, "40 plan + 25 pack");

// Lead subscription: its own pool, no rollover
g = await grant(boss, "leadsub", 100, "in_4:leadsub");
assert.equal(await balance(boss), 165);
assert.equal(await poolLeft(boss, "leadsub"), 100);
// Research search: hold + release pair up, one spend (from the oldest grant: plan)
r = await submit(boss, bp, "New Co", "Halifax", null, "full");
assert.equal(r.status, "queued");
assert.equal(await balance(boss), 164);
claimed = (await one("select finder_worker_claim($1, 5) as c", [worker])).c;
const mine = claimed.find((c) => c.company === "New Co");
assert.ok(mine);
r = (await one("select finder_worker_complete($1,$2,$3) as r", [worker, mine.item_id, JSON.stringify({ outcome: "found", company: { name: "New Co", website: "https://newco.example", source_url: "https://newco.example" }, contacts: [{ kind: "phone", value: "902 555 0100", source_url: "https://newco.example" }] })])).r;
assert.equal(r.status, "found");
assert.equal((await one("select locked from finder_results where id=$1", [r.result_id])).locked, false);
assert.equal(await balance(boss), 164);
assert.equal(await poolLeft(boss, "plan"), 39);
assert.equal(await poolLeft(boss, "leadsub"), 100);
g = await grant(boss, "leadsub", 100, "in_5:leadsub");
assert.equal(g.expired, 100, "unused lead-sub credits don't roll over");
assert.equal(await balance(boss), 164);

// Rollover switch on: nothing expires
g = await grant(boss, "plan", 40, "in_6:plan", true);
assert.equal(g.expired, 0);
assert.equal(await balance(boss), 204);

// Subscription ended: credits 0 = only expire what is left of that kind
g = await grant(boss, "leadsub", 0, "end:evt_1");
assert.equal(g.expired, 100);
assert.equal(await poolLeft(boss, "leadsub"), 0);
assert.equal(await balance(boss), 104);
g = await grant(boss, "leadsub", 0, "end:evt_1");
assert.equal(g.expired, 0);

// Pool and balance never make the balance negative
assert.ok((await balance(boss)) >= 0);

// Bad input
await fails("select finder_grant($1,'gift',10,'x_1',false)", [boss], /finder:bad_input/);
await fails("select finder_grant($1,'plan',-5,'x_2',false)", [boss], /finder:bad_input/);
await fails("select finder_grant(gen_random_uuid(),'plan',5,'x_3',false)", [], /finder:not_found/);

// Owner: unlimited, grants write nothing
g = await grant(ownerBiz, "plan", 40, "in_owner:plan");
assert.equal(g.status, "owner");
assert.equal(await rows(ownerBiz), 0);
const op = await newProfile(ownerBiz);
r = await submit(ownerBiz, op, "Acme Plumbing", "Toronto", null, "locked");
assert.equal(r.locked, false, "the owner is never locked");
assert.equal(await rows(ownerBiz), 0);

// The 0019 form (the app on main) still works: full mode
const beta = await newBiz("free");
const betaP = await newProfile(beta);
await one("select finder_beta_grant($1, 10)", [beta]);
r = (await one("select finder_submit($1,$2,'single','Acme Plumbing','Toronto',null,null,'CA',false) as r", [beta, betaP])).r;
assert.equal(r.status, "found");
assert.equal(r.locked, false);
assert.equal(await balance(beta), 9);

// ------------------------------------------------------------------
// The smart search box: 5 kinds; the intake is optional (AUP only)
// ------------------------------------------------------------------
const quick = await newBiz("pro");
const aupOnly = (await one("insert into finder_profiles (business_id, aup_version) values ($1,'2026-09-27') returning id, my_business", [quick]));
assert.equal(aupOnly.my_business, null, "intake fields optional");
await grant(quick, "pack", 25, "cs_quick");
// domain -> known company
r = await submitQ(quick, aupOnly.id, { kind: "domain", company: "acmeplumbing.example", website: "https://www.acmeplumbing.example/about" }, "full");
assert.equal(r.status, "found");
// business email -> its domain -> known company
r = await submitQ(quick, aupOnly.id, { kind: "email", company: "acmeplumbing.example", website: "acmeplumbing.example", email: "Info@AcmePlumbing.example" }, "full");
assert.equal(r.status, "found");
assert.equal((await one("select query_kind, query_email from finder_job_items where id=$1", [r.item_id])).query_email, "info@acmeplumbing.example");
// phone -> known company by its number (any format)
r = await submitQ(quick, aupOnly.id, { kind: "phone", company: "(416) 555-0100", phone: "+1 (416) 555-0100" }, "full");
assert.equal(r.status, "found");
res = await one("select company_name from finder_results where id=$1", [r.result_id]);
assert.equal(res.company_name, "Acme Plumbing");
// unknown phone -> queued for the worker, with the number
r = await submitQ(quick, aupOnly.id, { kind: "phone", company: "905-555-0199", phone: "905-555-0199", city: "Oakville" }, "full");
assert.equal(r.status, "queued");
// company name without a city -> fine
r = await submitQ(quick, aupOnly.id, { kind: "company", company: "Brand New Bakery" }, "full");
assert.equal(r.status, "queued");
// person at a company -> never answered from our records, always the worker
r = await submitQ(quick, aupOnly.id, { kind: "person", company: "Acme Plumbing", city: "Toronto", person: "Jane  Doe" }, "full");
assert.equal(r.status, "queued", "people are not in our records");
claimed = (await one("select finder_worker_claim($1, 5) as c", [worker])).c;
const kinds = Object.fromEntries(claimed.map((c) => [c.kind, c]));
assert.equal(kinds.phone.phone, "9055550199");
assert.equal(kinds.person.person, "Jane Doe");
assert.equal(kinds.person.company, "Acme Plumbing");
assert.equal(kinds.company.company, "Brand New Bakery");
// bad inputs per kind
await fails("select finder_submit($1,$2,'single','{\"kind\":\"email\",\"company\":\"x\",\"website\":\"x.example\",\"email\":\"not-an-email\"}'::jsonb,'full',5)", [quick, aupOnly.id], /finder:bad_input/);
await fails("select finder_submit($1,$2,'single','{\"kind\":\"phone\",\"company\":\"12\",\"phone\":\"12\"}'::jsonb,'full',5)", [quick, aupOnly.id], /finder:bad_input/);
await fails("select finder_submit($1,$2,'single','{\"kind\":\"person\",\"company\":\"Acme\"}'::jsonb,'full',5)", [quick, aupOnly.id], /finder:bad_input/);
await fails("select finder_submit($1,$2,'single','{\"kind\":\"people\",\"company\":\"Acme\"}'::jsonb,'full',5)", [quick, aupOnly.id], /finder:bad_input/);
// no Acceptable Use -> refused
await fails("select finder_submit($1,null,'single','{\"company\":\"Acme\"}'::jsonb,'full',5)", [quick], /finder:no_profile/);

// Intake area + radius (miles stored as km)
await q("update finder_profiles set area='CAUS', country=null, place='Mississauga', radius_km=80 where id=$1", [aupOnly.id]);
await fails("update finder_profiles set area='EU' where id=$1", [aupOnly.id], /finder_profiles_area_check/);
await fails("update finder_profiles set radius_km=100 where id=$1", [aupOnly.id], /radius_km/);
r = await submitQ(quick, aupOnly.id, { kind: "company", company: "Area Test Co", country: null }, "full");
claimed = (await one("select finder_worker_claim($1, 5) as c", [worker])).c;
const areaItem = claimed.find((c) => c.item_id === r.item_id);
assert.equal(areaItem.intake_area, "CAUS");
assert.equal(areaItem.intake_radius_km, 80);
assert.equal(areaItem.intake_place, "Mississauga");

// ------------------------------------------------------------------
// "Find me customers": discovery runs
// ------------------------------------------------------------------
const cleaner = await newBiz("pro");
const cp = (await one("insert into finder_profiles (business_id, aup_version) values ($1,'2026-09-27') returning id", [cleaner])).id;
await fails("select finder_discover_submit($1,$2,'full',10,5,'x')", [cleaner, cp], /finder:no_profile/, );
await q("update finder_profiles set my_business='Office cleaning', offer='Nightly office and warehouse cleaning', place='Kitchener', radius_km=24, area='CA', country='CA', industries='{}' where id=$1", [cp]);
await fails("select finder_discover_submit($1,$2,'full',10,5,'x')", [cleaner, cp], /finder:no_industries/);
await q("update finder_profiles set industries='{offices,manufacturing}', exclude='Big Box Inc' where id=$1", [cp]);
await fails("select finder_discover_submit($1,$2,'full',10,5,'x')", [cleaner, cp], /finder:no_credits/);
await grant(cleaner, "plan", 3, "in_clean:plan");
// the user already has one of them as a lead
await q("insert into leads (business_id, name, company, website) values ($1,'Old lead','Grand River Offices','https://grandriveroffices.example')", [cleaner]);
r = (await one("select finder_discover_submit($1,$2,'full',3,5,'Find customers: Offices, Manufacturing') as r", [cleaner, cp])).r;
assert.equal(r.status, "queued");
const discItem = r.item_id;
await fails("select finder_discover_submit($1,$2,'full',3,5,'again')", [cleaner, cp], /finder:discover_busy/);
// drain other queued work first, then claim the run
for (;;) {
  const c = (await one("select finder_worker_claim($1, 5) as c", [worker])).c;
  const d = c.find((x) => x.item_id === discItem);
  for (const x of c) if (x.item_id !== discItem) await one("select finder_worker_complete($1,$2,'{\"outcome\":\"not_found\"}')", [worker, x.item_id]);
  if (d) { claimed = [d]; break; }
  assert.ok(c.length, "the run was claimed");
}
assert.equal(claimed[0].kind, "discover");
assert.equal(claimed[0].want, 3);
assert.deepEqual(claimed[0].intake_industries, ["offices", "manufacturing"]);
assert.equal(claimed[0].intake_place, "Kitchener");
assert.equal(claimed[0].intake_radius_km, 24);
assert.equal(claimed[0].intake_exclude, "Big Box Inc");
const disc = {
  companies: [
    { name: "Grand River Offices", website: "https://grandriveroffices.example", city: "Kitchener", source_url: "https://www.openstreetmap.org/node/1" },
    { name: "Acme Plumbing", website: "https://acmeplumbing.example/", city: "Toronto", source_url: "https://www.openstreetmap.org/node/2" },
    { name: "Waterloo Widgets", website: "https://wwidgets.example", city: "Waterloo", source_url: "https://www.openstreetmap.org/node/3" },
    { name: "Waterloo Widgets", website: "https://wwidgets.example", city: "Waterloo", source_url: "https://www.openstreetmap.org/node/3" },
    { name: "Hidden Co", website: "https://hidden.example", city: "Kitchener", source_url: "https://www.openstreetmap.org/node/4" },
    { name: "KW Tool & Die", website: "javascript:alert(1)", city: "Kitchener", source_url: "https://www.openstreetmap.org/node/5" },
    { name: "Fifth One", city: "Kitchener", source_url: "https://www.openstreetmap.org/node/6" },
  ],
};
await q("insert into kb_suppression (kind, value_norm) values ('domain','hidden.example') on conflict do nothing");
await fails("select finder_worker_discovered(gen_random_uuid(), $1, '{}')", [discItem], /finder:not_yours/);
r = (await one("select finder_worker_discovered($1,$2,$3) as r", [worker, discItem, JSON.stringify(disc)])).r;
assert.equal(r.added, 3, "want = 3: lead, duplicate and removal-list entries skipped");
assert.equal(r.known, 1, "Acme is in our records: delivered at once");
const kids = await q("select company, website, status, held from finder_job_items where job_id=(select job_id from finder_job_items where id=$1) and query_kind='company' order by created_at", [discItem]);
assert.deepEqual(kids.map((k) => k.company), ["Acme Plumbing", "Waterloo Widgets", "KW Tool & Die"]);
assert.equal(kids[2].website, null, "a bad link is dropped");
assert.equal(kids[0].status, "found");
assert.equal(kids.filter((k) => k.held).length, 2, "Boss: 1 credit held per company being researched");
assert.equal(await balance(cleaner), 0, "3 credits: 1 spent (known) + 2 held");
const dstate = await one("select status, note from finder_job_items where id=$1", [discItem]);
assert.equal(dstate.status, "found");
assert.match(dstate.note, /3 new companies/);
// Starter: the same run comes back locked and free
const cheap = await newBiz("free");
const chp = (await one("insert into finder_profiles (business_id, aup_version, my_business, offer, industries) values ($1,'2026-09-27','Cleaning','Cleaning','{offices}') returning id", [cheap])).id;
r = (await one("select finder_discover_submit($1,$2,'locked',10,5,'Find customers') as r", [cheap, chp])).r;
assert.equal(r.locked, true);
const cItem = r.item_id;
for (;;) {
  const c = (await one("select finder_worker_claim($1, 5) as c", [worker])).c;
  const d = c.find((x) => x.item_id === cItem);
  for (const x of c) if (x.item_id !== cItem) await one("select finder_worker_complete($1,$2,'{\"outcome\":\"not_found\"}')", [worker, x.item_id]);
  if (d) break;
  assert.ok(c.length);
}
r = (await one("select finder_worker_discovered($1,$2,$3) as r", [worker, cItem, JSON.stringify({ companies: [disc.companies[1], disc.companies[2]] })])).r;
assert.equal(r.added, 2);
res = await one("select r.* from finder_results r join finder_job_items i on i.id = r.item_id where i.business_id=$1", [cheap]);
assert.equal(res.locked, true, "Starter: discovered results are locked");
assert.equal(res.phone, null);
assert.equal(await rows(cheap), 0, "Starter: no credits used");

// Users can't read candidates (they can hold websites); other columns stay readable
await db.exec("grant select on businesses to authenticated; grant usage on schema auth to authenticated; set role authenticated");
await fails("select candidates from finder_job_items", [], /permission denied/);
await q("select id, status, company from finder_job_items");
await fails("select * from finder_grants", [], /permission denied/);
await q("select status from finder_lead_subs");
await db.exec("reset role");

// Ledger: 'expire' rows are append-only too
await fails("update finder_credit_ledger set delta = 0 where reason='expire'", [], /append-only/);

// ------------------------------------------------------------------
// Fair credits (src/lib/fair-credit-server.ts), no schema change: the same
// service-role writes the server makes when a paid result's email fails
// the free check. One report row per result = never refunded twice.
// ------------------------------------------------------------------
{
  r = await submit(boss, bp, "Acme Plumbing", "Toronto", null, "full");
  assert.equal(r.status, "found");
  const paid = r.result_id;
  const before = await balance(boss);
  const spent = await one("select count(*)::int n from finder_credit_ledger where result_id=$1 and reason='spend'", [paid]);
  assert.equal(spent.n, 1, "the spend row points at the result (what the server looks for)");

  await q("insert into finder_bounce_reports (business_id, result_id, kind, note, status) values ($1,$2,'bounce','Bad email: credit returned (automatic check: the domain has no mail server)','refunded')", [boss, paid]);
  await q("insert into finder_credit_ledger (business_id, delta, reason, result_id, note) values ($1, 1, 'refund', $2, 'bad_email')", [boss, paid]);
  await q("update finder_results set email_checks = coalesce(email_checks,'{}'::jsonb) || '{\"fair\":\"bad\",\"fair_refunded\":true}'::jsonb where id=$1 and locked = false", [paid]);
  await q("insert into finder_audit (business_id, actor, action, detail) values ($1,'system','fair_refund',jsonb_build_object('result',$2::text))", [boss, paid]);
  assert.equal(await balance(boss), before + 1, "the credit is back");

  // A second run (or a second tab) can't claim the same result again
  await fails("insert into finder_bounce_reports (business_id, result_id, kind, status) values ($1,$2,'bounce','refunded')", [boss, paid], /duplicate key|unique/);
  // ...and the user's own bounce report can't refund it a second time
  await fails("select finder_report_bounce($1,'bounce','bounced')", [paid], /finder:already_reported/);
  assert.equal(await balance(boss), before + 1);
  const fair = await one("select email_checks->>'fair' f from finder_results where id=$1", [paid]);
  assert.equal(fair.f, "bad");
}

console.log("ALL 0020 SQL CHECKS PASSED");
