// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN, fillTemplate, mergeTemplates, quickDates } from "./templates.ts";

test("all 11 built-in templates exist in English and French", () => {
  assert.equal(BUILT_IN.en.length, 11);
  assert.deepEqual(BUILT_IN.fr.map((t) => t.key), BUILT_IN.en.map((t) => t.key));
});

test("placeholders are filled; a missing link line is dropped", () => {
  const t = BUILT_IN.en.find((x) => x.key === "reminder_friendly")!;
  const body = fillTemplate(t.body, { first_name: "Greg", invoice_number: "INV-0003", amount: "CA$226.00", due_date: "2026-10-10", my_name: "Lucy" });
  assert.match(body, /Hi Greg,/);
  assert.match(body, /INV-0003 for CA\$226\.00 was due on 2026-10-10/);
  assert.ok(!body.includes("{link}") && !body.includes("___\n\nThanks"));
  assert.equal(fillTemplate("Hi {first_name}", {}), "Hi there");
});

test("saved changes replace a built-in; own templates are added", () => {
  const merged = mergeTemplates([
    { id: "1", key: "follow_up", lang: "en", name: "Follow-up", subject: "Checking in", body: "Hey" },
    { id: "2", key: "custom-x", lang: "en", name: "Deposit", subject: "Deposit", body: "Please send the deposit" },
    { id: "3", key: "follow_up", lang: "fr", name: "Relance", subject: "Salut", body: "Coucou" },
  ]);
  assert.equal(merged.find((t) => t.key === "follow_up")?.subject, "Checking in");
  assert.equal(merged.length, 12);
  assert.equal(merged[11].builtIn, false);
});

test("quick dates", () => {
  const sat = new Date(2026, 8, 26, 9, 0); // Saturday 26 Sep 2026
  const q = quickDates(sat);
  assert.equal(q[0].date, "2026-09-26");
  assert.equal(q[1].date, "2026-09-27");
  assert.equal(q[2].date, "2026-09-28"); // next Monday
  assert.equal(q[5].date, "2026-10-10");
});
