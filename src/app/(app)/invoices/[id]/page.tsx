import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserAndBusiness } from "@/lib/data";
import {
  formatMoney,
  INVOICE_STATUS_META,
  type Invoice,
  type InvoiceItem,
} from "@/lib/types";
import { setInvoiceStatus, deleteInvoice } from "../actions";
import PrintButton from "./print-button";
import { DeleteButton } from "@/components/row-actions";
import { invoiceTotals } from "@/lib/line-settings";
import SendDocButton from "@/components/send-doc-dialog";
import { emailNote, emailStatus } from "@/lib/email";
import { invoiceEmailText } from "@/lib/invoice-doc";
import { revokeShareLinks } from "../../share/actions";

export const metadata = { title: "Invoice" };

type FullInvoice = Invoice & {
  currency?: string | null;
  tax_label?: string | null;
  tax_rate?: number | null;
  customers: { name: string; company: string | null; email: string | null } | null;
  invoice_items: InvoiceItem[];
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, business } = await requireUserAndBusiness();

  const { data } = await supabase
    .from("invoices")
    .select("*, customers(name, company, email), invoice_items(*)")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();

  if (!data) {
    notFound();
  }

  const invoice = data as FullInvoice;
  const items = [...invoice.invoice_items].sort(
    (a, b) => a.position - b.position
  );
  // Currency and tax are kept on the invoice (0017); older ones use the
  // business currency and have no tax.
  const currency = invoice.currency || business.currency;
  const taxRate = Number(invoice.tax_rate ?? 0);
  const { subtotal, tax, total } = invoiceTotals(items, taxRate);
  const meta = INVOICE_STATUS_META[invoice.status];
  const isQuote = invoice.doc_type === "quote";

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const send = emailStatus(business);
  const title = `${isQuote ? "Quote" : "Invoice"} ${invoice.number}`;
  const fromName = profile?.full_name || business.name;
  const emailBody = invoiceEmailText(
    {
      number: invoice.number,
      doc_type: invoice.doc_type,
      status: invoice.status,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      notes: invoice.notes,
      currency,
      tax_label: invoice.tax_label ?? null,
      tax_rate: taxRate,
      business_name: business.name,
      owner_name: profile?.full_name ?? null,
      customer_name: invoice.customers?.name ?? null,
      customer_company: invoice.customers?.company ?? null,
      items: items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
    },
    "{link}",
    fromName
  );

  return (
    <div className="mx-auto max-w-6xl [&>*]:max-w-3xl">
      {/* Controls — hidden when printing */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/invoices"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          &larr; Back to invoices
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <SendDocButton
            kind="invoice"
            id={invoice.id}
            title={title}
            to={invoice.customers ? { name: invoice.customers.name, email: invoice.customers.email } : null}
            subject={`${title} from ${business.name}`}
            body={emailBody}
            canSend={send.canSend}
            sendNote={send.canSend ? undefined : emailNote(send)}
            status={invoice.status}
            vars={{
              business: business.name,
              my_name: fromName,
              invoice_number: invoice.number,
              amount: formatMoney(total, currency),
              due_date: invoice.due_date ?? undefined,
            }}
          />
          {invoice.status === "draft" && (
            <form action={setInvoiceStatus}>
              <input type="hidden" name="id" value={invoice.id} />
              <input type="hidden" name="status" value="sent" />
              <button
                type="submit"
                className="btn-secondary"
              >
                Mark sent
              </button>
            </form>
          )}
          {isQuote && invoice.status === "sent" && (
            <form action={setInvoiceStatus}>
              <input type="hidden" name="id" value={invoice.id} />
              <input type="hidden" name="status" value="accepted" />
              <button
                type="submit"
                className="rounded-md border border-green-300 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50"
              >
                Mark accepted
              </button>
            </form>
          )}
          {!isQuote && invoice.status !== "paid" && (
            <form action={setInvoiceStatus}>
              <input type="hidden" name="id" value={invoice.id} />
              <input type="hidden" name="status" value="paid" />
              <button
                type="submit"
                className="rounded-md border border-green-300 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50"
              >
                💰 Mark paid
              </button>
            </form>
          )}
          <Link href={`/invoices/${invoice.id}/edit`} className="btn-secondary">
            Edit
          </Link>
          <PrintButton />
          <form action={revokeShareLinks}>
            <input type="hidden" name="kind" value="invoice" />
            <input type="hidden" name="id" value={invoice.id} />
            <button type="submit" className="btn-ghost btn-sm" title="Old view links stop working; a new one is made next time you send">
              Turn off view links
            </button>
          </form>
          <DeleteButton
            action={deleteInvoice}
            id={invoice.id}
            what={`${isQuote ? "quote" : "invoice"} ${invoice.number}`}
          />
        </div>
      </div>

      {/* The document itself — print-friendly */}
      <div className="mt-4 card p-8 print:mt-0 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="page-title">
              {isQuote ? "Quote" : "Invoice"} {invoice.number}
            </h1>
            <p className="page-sub">
              Issued {invoice.issue_date}
              {invoice.due_date ? ` · Due ${invoice.due_date}` : ""}
            </p>
          </div>
          <span
            className={`inline-block rounded-full border px-3 py-1 text-sm font-medium print:hidden ${meta.badgeClass}`}
          >
            {meta.label}
          </span>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-8 text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              From
            </p>
            <p className="mt-1 font-semibold text-slate-800">{business.name}</p>
            {profile?.full_name && (
              <p className="text-slate-600">{profile.full_name}</p>
            )}
            <p className="text-slate-600">{user.email}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              To
            </p>
            {invoice.customers ? (
              <>
                <p className="mt-1 font-semibold text-slate-800">
                  {invoice.customers.name}
                </p>
                {invoice.customers.company && (
                  <p className="text-slate-600">{invoice.customers.company}</p>
                )}
                {invoice.customers.email && (
                  <p className="text-slate-600">{invoice.customers.email}</p>
                )}
              </>
            ) : (
              <p className="mt-1 text-slate-400">—</p>
            )}
          </div>
        </div>

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
              <th className="pb-2">Description</th>
              <th className="pb-2 text-right">Qty</th>
              <th className="pb-2 text-right">Unit price</th>
              <th className="pb-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-2.5 text-slate-700">{item.description}</td>
                <td className="py-2.5 text-right text-slate-600">
                  {Number(item.quantity)}
                </td>
                <td className="py-2.5 text-right text-slate-600">
                  {formatMoney(Number(item.unit_price), currency)}
                </td>
                <td className="py-2.5 text-right font-medium text-slate-800">
                  {formatMoney(
                    Number(item.quantity) * Number(item.unit_price),
                    currency
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {taxRate > 0 && (
              <>
                <tr>
                  <td colSpan={3} className="pt-4 text-right text-slate-600">
                    Subtotal
                  </td>
                  <td className="pt-4 text-right text-slate-700">{formatMoney(subtotal, currency)}</td>
                </tr>
                <tr>
                  <td colSpan={3} className="pt-1 text-right text-slate-600">
                    {invoice.tax_label ?? "Tax"} {taxRate}%
                  </td>
                  <td className="pt-1 text-right text-slate-700">{formatMoney(tax, currency)}</td>
                </tr>
              </>
            )}
            <tr>
              <td colSpan={3} className="pt-4 text-right font-semibold text-slate-800">
                Total ({currency})
              </td>
              <td className="pt-4 text-right text-lg font-bold text-slate-900">
                {formatMoney(total, currency)}
              </td>
            </tr>
          </tfoot>
        </table>

        {invoice.notes && (
          <div className="mt-8 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Notes
            </p>
            <p className="mt-1 whitespace-pre-wrap text-slate-600">
              {invoice.notes}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
