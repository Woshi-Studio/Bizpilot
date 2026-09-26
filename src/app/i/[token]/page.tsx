import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/app/(app)/invoices/[id]/print-button";
import { docTitle, docTotals, money, type InvoiceDoc } from "@/lib/invoice-doc";

// The customer's view of an invoice / quote, opened from the link in the
// email. No login: the long random token in the URL is the key, and the
// database (shared_invoice, 0017) returns only this one document.
export const metadata: Metadata = {
  title: "Invoice",
  robots: { index: false, follow: false },
};

export default async function SharedInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("shared_invoice", { p_token: token });
  if (error || !data) notFound();

  const d = data as InvoiceDoc;
  d.tax_rate = Number(d.tax_rate ?? 0);
  const t = docTotals(d);
  const isQuote = d.doc_type === "quote";

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <p className="text-sm text-muted">
            {isQuote ? "Quote" : "Invoice"} from <span className="font-semibold text-ink">{d.business_name}</span>
          </p>
          <PrintButton />
        </div>

        <div className="card p-5 sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="page-title">{docTitle(d)}</h1>
              <p className="page-sub">
                Issued {d.issue_date}
                {d.due_date ? ` · Due ${d.due_date}` : ""}
              </p>
            </div>
            {d.status === "paid" && (
              <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
                Paid
              </span>
            )}
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 text-sm sm:grid-cols-2 sm:gap-8 [overflow-wrap:anywhere]">
            <div>
              <p className="eyebrow">From</p>
              <p className="mt-1 font-semibold text-ink">{d.business_name}</p>
              {d.owner_name && <p className="text-ink-2">{d.owner_name}</p>}
            </div>
            <div>
              <p className="eyebrow">To</p>
              <p className="mt-1 font-semibold text-ink">{d.customer_name ?? "—"}</p>
              {d.customer_company && <p className="text-ink-2">{d.customer_company}</p>}
            </div>
          </div>

          <table className="mt-8 w-full text-sm [&_td+td]:pl-3 [&_th+th]:pl-3">
            <thead>
              <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-subtle">
                <th className="pb-2">Description</th>
                <th className="pb-2 text-right">Qty</th>
                <th className="pb-2 text-right">Unit price</th>
                <th className="pb-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((item, i) => (
                <tr key={i} className="border-b border-line/60">
                  <td className="py-2.5 text-ink-2">{item.description}</td>
                  <td className="py-2.5 text-right whitespace-nowrap text-ink-2">{Number(item.quantity)}</td>
                  <td className="py-2.5 text-right whitespace-nowrap text-ink-2">{money(Number(item.unit_price), d.currency)}</td>
                  <td className="py-2.5 text-right whitespace-nowrap font-medium text-ink">
                    {money(Number(item.quantity) * Number(item.unit_price), d.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {d.tax_rate > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="pt-4 text-right text-ink-2">Subtotal</td>
                    <td className="pt-4 text-right text-ink-2">{money(t.subtotal, d.currency)}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="pt-1 text-right text-ink-2">
                      {d.tax_label ?? "Tax"} {d.tax_rate}%
                    </td>
                    <td className="pt-1 text-right text-ink-2">{money(t.tax, d.currency)}</td>
                  </tr>
                </>
              )}
              <tr>
                <td colSpan={3} className="pt-4 text-right font-semibold text-ink">
                  Total ({d.currency})
                </td>
                <td className="pt-4 text-right whitespace-nowrap text-lg font-bold text-ink">{money(t.total, d.currency)}</td>
              </tr>
            </tfoot>
          </table>

          {d.notes && (
            <div className="mt-8 text-sm">
              <p className="eyebrow">How to pay / notes</p>
              <p className="mt-1 whitespace-pre-wrap text-ink-2">{d.notes}</p>
            </div>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-subtle print:hidden">Sent with Jephelen</p>
      </div>
    </main>
  );
}
