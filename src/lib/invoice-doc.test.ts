// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceEmailText, invoiceHtml, type InvoiceDoc } from "./invoice-doc.ts";

const doc: InvoiceDoc = {
  number: "INV-0007",
  doc_type: "invoice",
  status: "draft",
  issue_date: "2026-09-26",
  due_date: "2026-10-10",
  notes: "Interac e-Transfer: pay@example.com",
  currency: "CAD",
  tax_label: "HST",
  tax_rate: 13,
  business_name: "Woshi Studio",
  owner_name: "Lucy",
  customer_name: "Greg <script>alert(1)</script>",
  customer_company: null,
  items: [{ description: "Logo & icons", quantity: 2, unit_price: 100 }],
};

test("the HTML copy shows totals with HST and escapes text", () => {
  const html = invoiceHtml(doc, "https://example.com/i/abc");
  assert.match(html, /Invoice INV-0007/);
  assert.match(html, /HST 13%/);
  assert.match(html, /CA\$226\.00/);
  assert.match(html, /Logo &amp; icons/);
  assert.ok(!html.includes("<script>alert"), "customer name is escaped");
});

test("the email text has the amount, due date and view link", () => {
  const text = invoiceEmailText(doc, "https://example.com/i/abc", "Lucy");
  assert.match(text, /INV-0007 from Woshi Studio for CA\$226\.00, due 2026-10-10/);
  assert.match(text, /https:\/\/example\.com\/i\/abc/);
});
