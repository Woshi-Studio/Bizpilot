// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { EXPORT_COLUMNS, crmToRow, csvCell, exportFileName, resultToRow, toCsv, unlockTimes } from "./lead-export.ts";

const result = {
  id: "r1",
  company_name: "Treehaus, Inc.",
  website: "https://treehaus.example",
  city: "Kitchener",
  region: "ON",
  country: "CA",
  phone: "519-555-0100",
  email: "hello@treehaus.example",
  email_checks: { format: true, mx: true },
  source_urls: ["https://treehaus.example/contact"],
  locked: false,
  created_at: "2026-09-20T10:00:00Z",
  contact_name: "Ann Lee",
};

test("one column set for everything", () => {
  assert.deepEqual([...EXPORT_COLUMNS], [
    "name", "title", "company", "email", "phone", "website", "city", "region", "country", "source", "unlocked_at",
  ]);
  const fromResult = resultToRow(result)!;
  const fromCrm = crmToRow({ name: "Bob", created_at: "2026-01-01T00:00:00Z" }, "lead");
  assert.deepEqual(Object.keys(fromResult), [...EXPORT_COLUMNS]);
  assert.deepEqual(Object.keys(fromCrm), [...EXPORT_COLUMNS]);
});

test("a locked result is never exported", () => {
  assert.equal(resultToRow({ ...result, locked: true }), null);
});

test("result row: contact, source, unlock time", () => {
  const row = resultToRow(result)!;
  assert.equal(row.name, "Ann Lee");
  assert.equal(row.company, "Treehaus, Inc.");
  assert.equal(row.source, "https://treehaus.example/contact");
  assert.equal(row.unlocked_at, "2026-09-20T10:00:00Z");
  assert.equal(resultToRow(result, "2026-09-25T00:00:00Z")!.unlocked_at, "2026-09-25T00:00:00Z");
  assert.equal(resultToRow({ ...result, source_urls: [] })!.source, "Jephelen Lead Finder");
});

test("an email that failed the free check is left out", () => {
  assert.equal(resultToRow({ ...result, email_checks: { fair: "bad" } })!.email, "");
});

test("csv quoting and formula guard", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell('a "b", c'), '"a ""b"", c"');
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("+1 519"), "'+1 519");
  assert.equal(csvCell(null), "");
  const csv = toCsv([resultToRow(result)!]);
  assert.ok(csv.startsWith("﻿name,title,company"));
  assert.ok(csv.includes('"Treehaus, Inc."'));
  assert.equal(csv.split("\r\n").length, 2);
});

test("crm rows", () => {
  const lead = crmToRow({ name: "Bob", company: "Acme", email: "b@acme.example", channel: "finder", created_at: "x" }, "lead");
  assert.equal(lead.source, "lead (finder)");
  assert.equal(crmToRow({ name: "C", created_at: "x" }, "customer").source, "customer");
});

test("file name and unlock times", () => {
  assert.equal(exportFileName("Woshi / Studio", "leads", new Date("2026-09-29T12:00:00Z")), "Woshi  Studio leads 2026-09-29.csv");
  const m = unlockTimes([
    { detail: { result: "r1" }, created_at: "2026-09-28" },
    { detail: { result: "r1" }, created_at: "2026-09-01" },
    { detail: null, created_at: "2026-09-02" },
  ]);
  assert.equal(m.get("r1"), "2026-09-28");
  assert.equal(m.size, 1);
});
