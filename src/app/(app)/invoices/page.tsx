import Link from "next/link";
import { DeleteButton } from "@/components/row-actions";
import { invoiceTotals } from "@/lib/line-settings";
import { deleteInvoice } from "./actions";
import { requireUserAndBusiness } from "@/lib/data";
import {
  formatMoney,
  INVOICE_STATUS_META,
  type Invoice,
} from "@/lib/types";
import BusinessLineFilter from "@/components/business-line-filter";
import { loadBusinessLines, withLine } from "@/lib/activities";
import { lineFromParam, lineLabel } from "@/lib/business-lines";

export const metadata = { title: "Invoices" };

type InvoiceRow = Invoice & {
  customers: { name: string } | null;
  invoice_items: { quantity: number; unit_price: number }[];
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ line?: string }>;
}) {
  const { supabase, business } = await requireUserAndBusiness();
  const line = lineFromParam((await searchParams).line);

  const INVOICE_COLUMNS: string =
    "*, customers(name), invoice_items(quantity, unit_price)";
  const [{ data }, lines] = await Promise.all([
    withLine(
      supabase
        .from("invoices")
        .select(INVOICE_COLUMNS)
        .eq("business_id", business.id),
      line
    ).order("created_at", { ascending: false }),
    loadBusinessLines(supabase, business.id),
  ]);

  const invoices = (data ?? []) as unknown as InvoiceRow[];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-sub">
            Quotes and invoices — mark them paid and the money logs itself.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/invoices/new?type=quote" className="btn-secondary">
            + New quote
          </Link>
          <Link href="/invoices/new" className="btn-primary">
            + New invoice
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <BusinessLineFilter basePath="/invoices" lines={lines} current={line} />
      </div>

      <div className="mt-6">
        {invoices.length === 0 ? (
          <p className="card-empty p-8 text-center text-sm text-slate-400">
            No invoices or quotes yet. Create your first one — it takes a
            minute.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden card">
            {invoices.map((inv) => {
              const extra = inv as { currency?: string | null; tax_rate?: number | null };
              const { total } = invoiceTotals(inv.invoice_items, extra.tax_rate ?? 0);
              const currency = extra.currency || business.currency;
              const meta = INVOICE_STATUS_META[inv.status];
              return (
                <li key={inv.id} className="flex items-center hover:bg-slate-50">
                  <Link
                    href={`/invoices/${inv.id}`}
                    className="flex min-w-0 flex-1 items-center gap-4 py-3.5 pl-5 pr-2"
                  >
                    <span className="w-24 shrink-0 section-title">
                      {inv.number}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-700">
                        {inv.customers?.name ?? "No customer"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {inv.doc_type === "quote" ? "Quote" : "Invoice"} ·{" "}
                        {inv.issue_date}
                        {inv.due_date ? ` · due ${inv.due_date}` : ""}
                        {inv.business_line
                          ? ` · ${lineLabel(inv.business_line)}`
                          : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-slate-900">
                      {formatMoney(total, currency)}
                    </span>
                    <span
                      className={`inline-block w-20 shrink-0 rounded-full border px-2.5 py-0.5 text-center text-xs font-medium ${meta.badgeClass}`}
                    >
                      {meta.label}
                    </span>
                  </Link>
                  <div className="flex shrink-0 items-center gap-0.5 pr-3">
                    <Link
                      href={`/invoices/${inv.id}/edit`}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surface-3 hover:text-ink"
                    >
                      Edit
                    </Link>
                    <DeleteButton
                      action={deleteInvoice}
                      id={inv.id}
                      what={`${inv.doc_type === "quote" ? "quote" : "invoice"} ${inv.number}`}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
