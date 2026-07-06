import Link from "next/link";
import { requireUserAndBusiness } from "@/lib/data";
import {
  formatMoney,
  INVOICE_STATUS_META,
  type Invoice,
} from "@/lib/types";

export const metadata = { title: "Invoices" };

type InvoiceRow = Invoice & {
  customers: { name: string } | null;
  invoice_items: { quantity: number; unit_price: number }[];
};

export default async function InvoicesPage() {
  const { supabase, business } = await requireUserAndBusiness();

  const { data } = await supabase
    .from("invoices")
    .select("*, customers(name), invoice_items(quantity, unit_price)")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });

  const invoices = (data ?? []) as InvoiceRow[];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="mt-1 text-sm text-slate-500">
            Quotes and invoices — mark them paid and the money logs itself.
          </p>
        </div>
        <Link
          href="/invoices/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          + New
        </Link>
      </div>

      <div className="mt-6">
        {invoices.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
            No invoices or quotes yet. Create your first one — it takes a
            minute.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {invoices.map((inv) => {
              const total = inv.invoice_items.reduce(
                (sum, i) => sum + Number(i.quantity) * Number(i.unit_price),
                0
              );
              const meta = INVOICE_STATUS_META[inv.status];
              return (
                <li key={inv.id}>
                  <Link
                    href={`/invoices/${inv.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50"
                  >
                    <span className="w-24 shrink-0 text-sm font-semibold text-slate-800">
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
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-slate-900">
                      {formatMoney(total, business.currency)}
                    </span>
                    <span
                      className={`inline-block w-20 shrink-0 rounded-full border px-2.5 py-0.5 text-center text-xs font-medium ${meta.badgeClass}`}
                    >
                      {meta.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
