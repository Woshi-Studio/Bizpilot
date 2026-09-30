// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOSS_CREDITS_PER_PERIOD,
  LEADSUB_CREDITS_PER_PERIOD,
  LEAD_PRODUCTS_BOSS_ONLY,
  WELCOME_LEAD_CREDITS,
  canBuyLeadProducts,
  finderProductForPrice,
  leadOffer,
  leadOfferText,
  welcomeDue,
  welcomeRef,
  finderProductReady,
  invoiceGrant,
  leadProductView,
  packGrant,
} from "./finder-plans.ts";

const env = {
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_PRICE_ID: "price_hustle",
  STRIPE_PRICE_ID_PRO: "price_boss",
  STRIPE_PRICE_ID_LEADSUB: " price_leadsub ",
  STRIPE_PRICE_ID_PACK25: "price_p25",
  STRIPE_PRICE_ID_PACK100: "price_p100",
};

test("buy buttons: 'Coming soon' until the price id is set", () => {
  assert.equal(finderProductReady("leadsub", env), true);
  assert.equal(finderProductReady("leadsub", { ...env, STRIPE_PRICE_ID_LEADSUB: "" }), false);
  assert.equal(finderProductReady("pack25", { ...env, STRIPE_SECRET_KEY: "" }), false);
  assert.equal(finderProductForPrice("price_leadsub", env), "leadsub", "stray spaces trimmed");
  assert.equal(finderProductForPrice("price_boss", env), null);
});

test("paid invoices: Boss and the lead sub grant credits, Hustle doesn't", () => {
  assert.deepEqual(invoiceGrant("price_boss", 1, env), { pool: "plan", credits: BOSS_CREDITS_PER_PERIOD });
  assert.deepEqual(invoiceGrant("price_leadsub", 1, env), { pool: "leadsub", credits: LEADSUB_CREDITS_PER_PERIOD });
  assert.deepEqual(invoiceGrant("price_leadsub", 2, env), { pool: "leadsub", credits: 2 * LEADSUB_CREDITS_PER_PERIOD });
  assert.equal(invoiceGrant("price_hustle", 1, env), null);
  assert.equal(invoiceGrant("price_unknown", 1, env), null);
  assert.equal(invoiceGrant(null, 1, env), null);
  assert.equal(invoiceGrant("price_boss", 1, { ...env, STRIPE_PRICE_ID_PRO: "" }), null);
});

test("packs: credits from the price, never from the browser", () => {
  assert.deepEqual(packGrant([{ priceId: "price_p25", quantity: 1 }], env), { pool: "pack", credits: 25 });
  assert.deepEqual(packGrant([{ priceId: "price_p100", quantity: 1 }], env), { pool: "pack", credits: 100 });
  assert.equal(packGrant([{ priceId: "price_boss", quantity: 1 }], env), null);
  assert.equal(packGrant([], env), null);
});

test("lead products: every plan can buy (Lucy 2026-09-30); the owner never buys", () => {
  assert.equal(LEAD_PRODUCTS_BOSS_ONLY, false);
  assert.equal(canBuyLeadProducts({ plan: "pro", owner: false }), true);
  assert.equal(canBuyLeadProducts({ plan: "premium", owner: false }), true);
  assert.equal(canBuyLeadProducts({ plan: "free", owner: false }), true);
  assert.equal(canBuyLeadProducts({ plan: "pro", owner: true }), false);
});

test("lead products on /plans: Starter, Hustle and Boss all get Buy; owner sees disabled", () => {
  assert.equal(leadProductView({ access: "full", plan: "pro", owner: false }), "buy");
  assert.equal(leadProductView({ access: "locked", plan: "premium", owner: false }), "buy");
  assert.equal(leadProductView({ access: "locked", plan: "free", owner: false }), "buy");
  assert.equal(leadProductView({ access: "full", plan: "free", owner: false }), "buy", "a Starter with credits");
  assert.equal(leadProductView({ access: "none", plan: "free", owner: false }), "upgrade", "Lead Finder not open to them");
  assert.equal(leadProductView({ access: "owner", plan: "free", owner: true }), "owner");
  assert.equal(leadProductView({ access: "full", plan: "pro", owner: true }), "owner");
});

test("welcome leads: 5, once, never the owner or a closed Lead Finder", () => {
  assert.equal(WELCOME_LEAD_CREDITS, 5);
  assert.equal(welcomeRef(" ABC-1 "), "welcome:abc-1");
  assert.equal(welcomeDue({ owner: false, access: "locked", hadGrant: false }), true);
  assert.equal(welcomeDue({ owner: false, access: "full", hadGrant: false }), true);
  assert.equal(welcomeDue({ owner: false, access: "locked", hadGrant: true }), false, "had credits before");
  assert.equal(welcomeDue({ owner: true, access: "owner", hadGrant: false }), false);
  assert.equal(welcomeDue({ owner: false, access: "none", hadGrant: false }), false);
});

test("Get leads line: free leads, bought credits, none; never a price", () => {
  const welcome = [{ delta: 5, reason: "grant", note: "pack" }];
  assert.deepEqual(leadOffer(welcome), { balance: 5, free: true });
  assert.match(leadOfferText(leadOffer(welcome)), /^You have 5 free leads\. Get more anytime: a lead pack or the lead subscription\.$/);
  const used = [...welcome, { delta: -1, reason: "spend" }];
  assert.match(leadOfferText(leadOffer(used)), /You have 4 free leads/);
  const bought = [...welcome, { delta: 25, reason: "grant", note: "pack" }];
  assert.equal(leadOffer(bought).free, false);
  assert.match(leadOfferText(leadOffer(bought)), /You have 30 lead credits/);
  assert.match(leadOfferText({ balance: 1, free: true }), /1 free lead\./);
  const out = leadOfferText(leadOffer([...welcome, { delta: -5, reason: "spend" }]));
  assert.match(out, /out of lead credits/);
  for (const t of [out, leadOfferText(leadOffer(bought))]) assert.doesNotMatch(t, /\$|USD|price/i);
});

