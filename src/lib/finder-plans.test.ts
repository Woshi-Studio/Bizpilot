// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOSS_CREDITS_PER_PERIOD,
  LEADSUB_CREDITS_PER_PERIOD,
  canBuyLeadProducts,
  finderProductForPrice,
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

test("lead products: Boss only; the owner never buys", () => {
  assert.equal(canBuyLeadProducts({ plan: "pro", owner: false }), true);
  assert.equal(canBuyLeadProducts({ plan: "premium", owner: false }), false);
  assert.equal(canBuyLeadProducts({ plan: "free", owner: false }), false);
  assert.equal(canBuyLeadProducts({ plan: "pro", owner: true }), false);
});

test("lead products on /plans: always shown; Boss buys, others upgrade, owner sees disabled", () => {
  assert.equal(leadProductView({ access: "full", plan: "pro", owner: false }), "buy");
  assert.equal(leadProductView({ access: "locked", plan: "premium", owner: false }), "upgrade");
  assert.equal(leadProductView({ access: "locked", plan: "free", owner: false }), "upgrade");
  assert.equal(leadProductView({ access: "full", plan: "premium", owner: false }), "upgrade");
  assert.equal(leadProductView({ access: "owner", plan: "free", owner: true }), "owner");
  assert.equal(leadProductView({ access: "full", plan: "pro", owner: true }), "owner");
});
