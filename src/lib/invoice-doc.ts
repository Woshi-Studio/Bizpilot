// An invoice / quote as a plain object, plus a stand-alone HTML copy
// (attached to emails; opens in any browser and prints to PDF).
// Pure: no imports except the totals helper.

import { invoiceTotals } from "./line-settings.ts";

export type InvoiceDoc = {
  number: string;
  doc_type: "invoice" | "quote";
  status: string;
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  currency: string;
  tax_label: string | null;
  tax_rate: number;
  business_name: string;
  owner_name: string | null;
  customer_name: string | null;
  customer_company: string | null;
  items: { description: string; quantity: number; unit_price: number }[];
};

export function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function docTitle(d: Pick<InvoiceDoc, "doc_type" | "number">) {
  return `${d.doc_type === "quote" ? "Quote" : "Invoice"} ${d.number}`;
}

export function docTotals(d: Pick<InvoiceDoc, "items" | "tax_rate">) {
  return invoiceTotals(d.items, d.tax_rate);
}

const esc = (s: string | null | undefined) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );

export function invoiceHtml(d: InvoiceDoc, viewUrl?: string | null): string {
  const t = docTotals(d);
  const rows = d.items
    .map(
      (i) => `<tr><td>${esc(i.description)}</td><td class="r">${Number(i.quantity)}</td>` +
        `<td class="r">${esc(money(Number(i.unit_price), d.currency))}</td>` +
        `<td class="r">${esc(money(Number(i.quantity) * Number(i.unit_price), d.currency))}</td></tr>`
    )
    .join("");
  const tax =
    d.tax_rate > 0
      ? `<tr><td colspan="3" class="r">Subtotal</td><td class="r">${esc(money(t.subtotal, d.currency))}</td></tr>` +
        `<tr><td colspan="3" class="r">${esc(d.tax_label ?? "Tax")} ${d.tax_rate}%</td><td class="r">${esc(money(t.tax, d.currency))}</td></tr>`
      : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(docTitle(d))} — ${esc(d.business_name)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:760px;margin:32px auto;padding:0 20px}
h1{font-size:26px;margin:0}.sub{color:#64748b;margin-top:4px}
.grid{display:flex;gap:40px;margin-top:28px;font-size:14px}.lbl{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8}
table{width:100%;border-collapse:collapse;margin-top:28px;font-size:14px}th{text-align:left;font-size:11px;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #e2e8f0;padding:8px 0}
td{padding:9px 0;border-bottom:1px solid #f1f5f9}.r{text-align:right}.total td{font-weight:700;font-size:17px;border:0;padding-top:14px}
.notes{margin-top:28px;font-size:14px;white-space:pre-wrap;color:#475569}.link{margin-top:24px;font-size:13px}
@media print{.link{display:none}}
</style></head><body>
<h1>${esc(docTitle(d))}</h1>
<div class="sub">Issued ${esc(d.issue_date)}${d.due_date ? ` · Due ${esc(d.due_date)}` : ""}</div>
<div class="grid"><div><div class="lbl">From</div><div><b>${esc(d.business_name)}</b></div>${d.owner_name ? `<div>${esc(d.owner_name)}</div>` : ""}</div>
<div><div class="lbl">To</div><div><b>${esc(d.customer_name ?? "—")}</b></div>${d.customer_company ? `<div>${esc(d.customer_company)}</div>` : ""}</div></div>
<table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>
<tbody>${rows}</tbody><tfoot>${tax}<tr class="total"><td colspan="3" class="r">Total (${esc(d.currency)})</td><td class="r">${esc(money(t.total, d.currency))}</td></tr></tfoot></table>
${d.notes ? `<div class="notes"><div class="lbl">Notes / how to pay</div>${esc(d.notes)}</div>` : ""}
${viewUrl ? `<p class="link">View online: <a href="${esc(viewUrl)}">${esc(viewUrl)}</a></p>` : ""}
</body></html>`;
}

// The friendly email text for sending an invoice / quote.
export function invoiceEmailText(d: InvoiceDoc, link: string, fromName: string) {
  const t = docTotals(d);
  const first = (d.customer_name ?? "").split(" ")[0] || "there";
  const what = d.doc_type === "quote" ? "quote" : "invoice";
  const lines = [
    `Hi ${first},`,
    "",
    d.doc_type === "quote"
      ? `Here is ${what} ${d.number} from ${d.business_name} for ${money(t.total, d.currency)}.`
      : `Here is ${what} ${d.number} from ${d.business_name} for ${money(t.total, d.currency)}${d.due_date ? `, due ${d.due_date}` : ""}.`,
    "",
    `View it (and print or save it as a PDF) here: ${link}`,
    "",
    "Let me know if you have any questions.",
    "",
    "Thank you!",
    fromName,
  ];
  return lines.join("\n");
}
