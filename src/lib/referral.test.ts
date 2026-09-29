// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REFERRAL_CREDITS,
  REFERRAL_POOL,
  decodeRefCode,
  encodeRefCode,
  paymentCleared,
  refFromMetadata,
  referralBlocked,
  referralLink,
  referralRef,
  referrerFromAppMetadata,
} from "./referral.ts";

const A = "3f2a9c1e-7b4d-4e8f-9a0b-1c2d3e4f5a6b";
const B = "00000000-0000-4000-8000-0000000b0501";

test("the reward is a constant, paid in credits that never expire", () => {
  assert.equal(REFERRAL_CREDITS, 25);
  assert.equal(REFERRAL_POOL, "pack");
  assert.equal(referralRef(A.toUpperCase()), `referral:${A}`);
});

test("invite code round-trips the business id, short and URL-safe", () => {
  for (const id of [A, B, "ffffffff-ffff-ffff-ffff-ffffffffffff", "00000000-0000-0000-0000-000000000000"]) {
    const code = encodeRefCode(id)!;
    assert.match(code, /^[A-Za-z0-9_-]{22}$/);
    assert.equal(decodeRefCode(code), id);
  }
  assert.equal(encodeRefCode("not-a-uuid"), null);
});

test("bad codes decode to nothing", () => {
  assert.equal(decodeRefCode(""), null);
  assert.equal(decodeRefCode(null), null);
  assert.equal(decodeRefCode("short"), null);
  assert.equal(decodeRefCode("a".repeat(23)), null);
  assert.equal(decodeRefCode("abc$efghijklmnopqrstuv"), null);
  // Non-zero padding bits: not a code we made
  const code = encodeRefCode(A)!;
  assert.equal(decodeRefCode(code.slice(0, 21) + "B"), null);
});

test("invite link", () => {
  assert.equal(referralLink("https://app.example/", B), `https://app.example/signup?ref=${encodeRefCode(B)}`);
});

test("no self-referral", () => {
  const base = {
    referrerBusinessId: A,
    referrerOwnerId: "u1",
    referrerEmail: "lucy@woshi.example",
    referredBusinessId: B,
    referredOwnerId: "u2",
    referredEmail: "ann@acme.example",
  };
  assert.equal(referralBlocked(base), null);
  assert.equal(referralBlocked({ ...base, referredBusinessId: A.toUpperCase() }), "same_business");
  assert.equal(referralBlocked({ ...base, referredOwnerId: "u1" }), "same_user");
  assert.equal(referralBlocked({ ...base, referredEmail: "Bob@Woshi.example" }), "same_domain");
  // Webmail is not a company domain
  assert.equal(referralBlocked({ ...base, referrerEmail: "a@gmail.com", referredEmail: "b@gmail.com" }), null);
  assert.equal(referralBlocked({ ...base, referredEmail: null }), null);
});

test("metadata", () => {
  const code = encodeRefCode(A)!;
  assert.equal(refFromMetadata({ ref: code }), code);
  assert.equal(refFromMetadata({ ref: "x" }), null);
  assert.equal(refFromMetadata(null), null);
  assert.equal(referrerFromAppMetadata({ referred_by: A.toUpperCase() }), A);
  assert.equal(referrerFromAppMetadata({ referred_by: "nope" }), null);
  assert.equal(referrerFromAppMetadata(undefined), null);
});

test("only a payment where money moved counts", () => {
  assert.equal(paymentCleared(500), true);
  assert.equal(paymentCleared(0), false);
  assert.equal(paymentCleared(null), false);
  assert.equal(paymentCleared(undefined), false);
});
