// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { FAQ, matchFaq } from "./help-faq.ts";

const id = (q: string) => matchFaq(q)?.entry.id ?? null;

test("has about 25 or more entries, all with an answer", () => {
  assert.ok(FAQ.length >= 25, `only ${FAQ.length}`);
  for (const e of FAQ) {
    assert.ok(e.a.length > 20 && e.keys.length > 0, e.id);
  }
  assert.equal(new Set(FAQ.map((e) => e.id)).size, FAQ.length, "ids are unique");
});

test("common how-to questions are answered from the guide", () => {
  assert.equal(id("How do I add a customer?"), "add-customer");
  assert.equal(id("how can i add a new client"), "add-customer");
  assert.equal(id("How do I send an invoice?"), "send-invoice");
  assert.equal(id("how do i make an invoice"), "create-invoice");
  assert.equal(id("Where do I book a meeting?"), "book-meeting");
  assert.equal(id("how do I schedule an appointment"), "book-meeting");
  assert.equal(id("How do I change the theme?"), "theme");
  assert.equal(id("how do i turn on dark mode"), "theme");
  assert.equal(id("How do I upgrade?"), "upgrade");
  assert.equal(id("how do i export my data"), "export");
  assert.equal(id("How do I turn a lead into a customer?"), "convert-lead");
  assert.equal(id("how do i cancel my subscription"), "cancel");
  assert.equal(id("how do I make a quote?"), "quote");
  assert.equal(id("where are my ai credits"), "credits");
  assert.equal(id("can you show me around again?"), "tour");
  assert.equal(id("how do I reset my password"), "password");
  assert.equal(id("how do I track my hours"), "time");
});

test("small typos and plurals still match", () => {
  assert.equal(id("how do i add a custmer"), "add-customer");
  assert.equal(id("how do I send invoices"), "send-invoice");
  assert.equal(id("how do i upload files"), "upload");
});

test("drafting work and open questions go to the AI", () => {
  assert.equal(id("Draft a friendly payment reminder"), null);
  assert.equal(id("Write a follow-up to Greg about the logo"), null);
  assert.equal(id("What should I do first today?"), null);
  assert.equal(id("Should I raise my prices for wedding clients next year?"), null);
  assert.equal(id(""), null);
  assert.equal(id("thanks!"), null);
});
