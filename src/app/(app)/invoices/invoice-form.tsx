"use client";

import { useActionState, useState } from "react";
import { formatMoney, type PaymentMethod } from "@/lib/types";
import {
  createInvoice,
  updateInvoice,
  type InvoiceFormState,
} from "./actions";
import BusinessLineInput from "@/components/business-line-input";
import FormError from "@/components/form-error";
import ServicePicker, { unitLabel, type PickableService } from "@/components/service-picker";
import Icon from "@/components/icons";
import {
  CURRENCIES,
  TAX_PRESETS,
  addDays,
  invoiceTotals,
  settingsFor,
  type LineSettings,
} from "@/lib/line-settings";

const initialState: InvoiceFormState = {};

const inputClass = "mt-1 input";

type Row = { key: number; description: string; quantity: string; unit_price: string };

export type EditableInvoice = {
  id: string;
  number: string;
  doc_type: "invoice" | "quote";
  customer_id: string | null;
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  business_line: string | null;
  currency: string | null;
  tax_label: string | null;
  tax_rate: number | null;
  items: { description: string; quantity: number; unit_price: number }[];
};

let nextKey = 1;
const blankRow = (): Row => ({ key: nextKey++, description: "", quantity: "1", unit_price: "" });

// New or edit invoice / quote. Everything connected:
//   - the customer's business fills the Business box;
//   - the Business decides the currency, the tax (e.g. HST 13%), the due
//     date and which services show up as one-click cards;
//   - ticking a payment method writes it into the notes.
export default function InvoiceForm({
  customers,
  currency: businessCurrency,
  paymentMethods,
  lines,
  lineSettings = [],
  services = [],
  defaultCustomerId,
  defaultDocType = "invoice",
  invoice,
}: {
  customers: { id: string; name: string; business_line?: string | null }[];
  currency: string;
  paymentMethods: PaymentMethod[];
  lines?: string[];
  lineSettings?: Omit<LineSettings, "saved">[];
  services?: PickableService[];
  defaultCustomerId?: string;
  defaultDocType?: "invoice" | "quote";
  invoice?: EditableInvoice;
}) {
  const editing = !!invoice;
  const [state, formAction, pending] = useActionState(
    editing ? updateInvoice : createInvoice,
    initialState
  );

  const today = new Date().toISOString().slice(0, 10);
  const startCustomer = invoice?.customer_id ?? defaultCustomerId ?? "";
  const customerLine = (id: string) => customers.find((c) => c.id === id)?.business_line ?? "";
  const startLine = invoice?.business_line ?? customerLine(startCustomer);
  const startSettings = settingsFor(startLine, lineSettings, businessCurrency);

  const [docType, setDocType] = useState<"invoice" | "quote">(invoice?.doc_type ?? defaultDocType);
  const [customerId, setCustomerId] = useState(startCustomer);
  const [line, setLine] = useState(startLine);
  const [lineTouched, setLineTouched] = useState(!!invoice?.business_line);
  const [issueDate, setIssueDate] = useState(invoice?.issue_date ?? today);
  const [dueDate, setDueDate] = useState(
    invoice ? invoice.due_date ?? "" : addDays(today, startSettings.due_days)
  );
  const [dueTouched, setDueTouched] = useState(editing);
  const [currency, setCurrency] = useState(invoice?.currency ?? startSettings.currency);
  const [taxOn, setTaxOn] = useState(
    invoice ? Number(invoice.tax_rate) > 0 : startSettings.tax_rate > 0
  );
  const [tax, setTax] = useState({
    label: invoice?.tax_label ?? startSettings.tax_label ?? "HST",
    rate: invoice && Number(invoice.tax_rate) > 0 ? Number(invoice.tax_rate) : startSettings.tax_rate || 13,
  });
  const [rows, setRows] = useState<Row[]>(
    invoice?.items.length
      ? invoice.items.map((i) => ({
          key: nextKey++,
          description: i.description,
          quantity: String(i.quantity),
          unit_price: String(i.unit_price),
        }))
      : [blankRow()]
  );
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [checkedMethods, setCheckedMethods] = useState<Set<string>>(new Set());

  // The Business changed: bring its currency, tax and due date along.
  function applyLine(next: string) {
    setLine(next);
    const s = settingsFor(next, lineSettings, businessCurrency);
    setCurrency(s.currency);
    setTaxOn(s.tax_rate > 0);
    if (s.tax_rate > 0) setTax({ label: s.tax_label ?? "Tax", rate: s.tax_rate });
    if (!dueTouched) setDueDate(addDays(issueDate, s.due_days));
  }

  function onCustomer(id: string) {
    setCustomerId(id);
    if (!lineTouched) applyLine(customerLine(id));
  }

  function toggleMethod(m: PaymentMethod) {
    const text = `${m.label}: ${m.value}`;
    setCheckedMethods((prev) => {
      const next = new Set(prev);
      if (next.has(m.id)) {
        next.delete(m.id);
        setNotes((n) =>
          n
            .split("\n")
            .filter((l) => l !== text)
            .join("\n")
        );
      } else {
        next.add(m.id);
        setNotes((n) => (n ? `${n}\n${text}` : text));
      }
      return next;
    });
  }

  const updateRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function addService(s: PickableService) {
    const unit = unitLabel(s.unit);
    const description = s.description ? `${s.name} — ${s.description}` : s.name;
    const row: Row = {
      key: nextKey++,
      description: unit === "project" ? description : `${description} (per ${unit})`,
      quantity: "1",
      unit_price: String(s.rate),
    };
    setRows((rs) => {
      // Replace the first empty line, else add one.
      const empty = rs.findIndex((r) => !r.description.trim() && !r.unit_price);
      if (empty >= 0) return rs.map((r, i) => (i === empty ? row : r));
      return [...rs, row];
    });
  }

  function removeRow(key: number) {
    setRows((rs) => {
      const left = rs.filter((r) => r.key !== key);
      return left.length ? left : [blankRow()];
    });
  }

  const totals = invoiceTotals(
    rows.map((r) => ({ quantity: r.quantity, unit_price: r.unit_price })),
    taxOn ? tax.rate : 0
  );

  const itemsJson = JSON.stringify(
    rows.map((r) => ({
      description: r.description,
      quantity: Number(r.quantity),
      unit_price: Number(r.unit_price),
    }))
  );

  const effectiveLine = line || customerLine(customerId);

  return (
    <form action={formAction} className="card p-6">
      {invoice && <input type="hidden" name="id" value={invoice.id} />}
      <input type="hidden" name="items" value={itemsJson} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="tax_label" value={taxOn ? tax.label : ""} />
      <input type="hidden" name="tax_rate" value={taxOn ? String(tax.rate) : "0"} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="doc_type" className="label">
            Document type
          </label>
          {editing ? (
            <>
              <input type="hidden" name="doc_type" value={docType} />
              <p className="mt-1 rounded-[var(--radius-control)] bg-surface-2 px-3.5 py-2.5 text-sm text-ink-2">
                {docType === "quote" ? "Quote" : "Invoice"} {invoice.number}
              </p>
            </>
          ) : (
            <select
              id="doc_type"
              name="doc_type"
              value={docType}
              onChange={(e) => setDocType(e.target.value as "invoice" | "quote")}
              className={inputClass}
            >
              <option value="invoice">Invoice</option>
              <option value="quote">Quote</option>
            </select>
          )}
        </div>
        <div>
          <label htmlFor="customer_id" className="label">
            Customer
          </label>
          <select
            id="customer_id"
            name="customer_id"
            value={customerId}
            onChange={(e) => onCustomer(e.target.value)}
            className={inputClass}
          >
            <option value="">No customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <BusinessLineInput
          id="invoice_business_line"
          lines={lines}
          value={line}
          onChange={(v) => {
            setLineTouched(true);
            applyLine(v || customerLine(customerId));
            setLine(v);
          }}
          label="Business"
          emptyLabel={customerId ? "Same as the customer" : "No business"}
          className="input"
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="issue_date" className="label">
              Issue date
            </label>
            <input
              id="issue_date"
              name="issue_date"
              type="date"
              value={issueDate}
              onChange={(e) => {
                setIssueDate(e.target.value);
                if (!dueTouched) {
                  const s = settingsFor(effectiveLine, lineSettings, businessCurrency);
                  setDueDate(addDays(e.target.value, s.due_days));
                }
              }}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="due_date" className="label">
              Due date
            </label>
            <input
              id="due_date"
              name="due_date"
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueTouched(true);
                setDueDate(e.target.value);
              }}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <h2 className="mt-7 section-title">Line items</h2>
      <div className="mt-3">
        <ServicePicker
          services={services}
          line={effectiveLine}
          currency={currency}
          onPick={addService}
        />
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={row.description}
              onChange={(e) => updateRow(row.key, { description: e.target.value })}
              placeholder="Description — e.g. Logo design"
              aria-label="Description"
              className="input flex-1"
            />
            <input
              type="number"
              value={row.quantity}
              min="0.25"
              step="0.25"
              onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
              placeholder="Qty"
              aria-label="Quantity"
              className="input sm:w-24"
            />
            <input
              type="number"
              value={row.unit_price}
              min="0"
              step="0.01"
              onChange={(e) => updateRow(row.key, { unit_price: e.target.value })}
              placeholder={`Price (${currency})`}
              aria-label={`Price in ${currency}`}
              className="input sm:w-36"
            />
            <button
              type="button"
              onClick={() => removeRow(row.key)}
              aria-label="Remove line"
              title="Remove line"
              className="flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-lg text-muted hover:bg-red-50 hover:text-red-600 sm:self-center"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setRows((rs) => [...rs, blankRow()])}
        className="mt-2 text-sm link"
      >
        + Add a line by hand
      </button>

      {paymentMethods.length > 0 ? (
        <div className="mt-6">
          <p className="label">How they can pay (added to the notes)</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {paymentMethods.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent-text"
              >
                <input
                  type="checkbox"
                  checked={checkedMethods.has(m.id)}
                  onChange={() => toggleMethod(m)}
                  className="h-3.5 w-3.5"
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-6 text-xs text-muted">
          Add how you get paid (Interac e-Transfer, bank transfer, PayPal) in{" "}
          <a href="/settings#payments" className="link">Settings → Payments</a> and tick them here.
        </p>
      )}

      <div className="mt-4">
        <label htmlFor="notes" className="label">
          Notes <span className="text-subtle">(payment details, terms…)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="mt-6 rounded-2xl bg-surface-2 p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2 text-ink-2">
            Currency
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="input w-auto! py-1!"
              aria-label="Currency"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-ink-2">
            <input
              type="checkbox"
              checked={taxOn}
              onChange={(e) => setTaxOn(e.target.checked)}
              className="h-4 w-4"
            />
            Add tax
          </label>
          {taxOn && (
            <select
              value={`${tax.label}|${tax.rate}`}
              onChange={(e) => {
                const [label, rate] = e.target.value.split("|");
                setTax({ label, rate: Number(rate) });
              }}
              className="input w-auto! py-1!"
              aria-label="Tax"
            >
              {[...TAX_PRESETS, ...(TAX_PRESETS.some((t) => t.label === tax.label && t.rate === tax.rate) ? [] : [tax])].map(
                (t) => (
                  <option key={`${t.label}|${t.rate}`} value={`${t.label}|${t.rate}`}>
                    {t.label} {t.rate}%
                  </option>
                )
              )}
            </select>
          )}
        </div>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between text-ink-2">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatMoney(totals.subtotal, currency)}</dd>
          </div>
          {taxOn && (
            <div className="flex justify-between text-ink-2">
              <dt>
                {tax.label} {tax.rate}%
              </dt>
              <dd className="tabular-nums">{formatMoney(totals.tax, currency)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold text-ink">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatMoney(totals.total, currency)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        {editing && (
          <a href={`/invoices/${invoice.id}`} className="btn-ghost">
            Cancel
          </a>
        )}
        <button type="submit" disabled={pending} className="btn-primary">
          {pending
            ? "Saving…"
            : editing
              ? "Save changes"
              : `Create ${docType === "quote" ? "quote" : "invoice"}`}
        </button>
      </div>

      <FormError error={state.error} upgrade={state.upgrade} className="mt-3" />
    </form>
  );
}
