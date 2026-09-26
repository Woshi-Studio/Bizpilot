"use client";

import { useActionState } from "react";
import { saveLineSettings, type SettingsState } from "./actions";
import { CURRENCIES, TAX_PRESETS, type LineSettings } from "@/lib/line-settings";
import { lineLabel } from "@/lib/business-lines";

const initial: SettingsState = {};

function LineRow({ s }: { s: LineSettings }) {
  const [state, action, pending] = useActionState(saveLineSettings, initial);
  const tax = s.tax_rate > 0 ? `${s.tax_label ?? "Tax"}|${s.tax_rate}` : "none";
  return (
    <form action={action} className="grid grid-cols-2 items-end gap-3 py-3 sm:grid-cols-[1.4fr_1fr_1fr_0.8fr_auto]">
      <input type="hidden" name="line" value={s.line} />
      <div className="col-span-2 sm:col-span-1">
        <p className="text-sm font-semibold text-ink">{lineLabel(s.line)}</p>
        <p className="text-xs text-muted">
          {state.success ? <span className="text-green-600">Saved</span> : s.saved ? "Saved settings" : "Default settings"}
        </p>
        {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      </div>
      <label className="text-xs text-muted">
        Currency
        <select name="currency" defaultValue={s.currency} className="input mt-1">
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-muted">
        Tax
        <select name="tax" defaultValue={tax} className="input mt-1">
          <option value="none">No tax</option>
          {TAX_PRESETS.map((t) => (
            <option key={t.label} value={`${t.label}|${t.rate}`}>
              {t.label} {t.rate}%{t.label === "HST" ? " (Ontario)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-muted">
        Due in (days)
        <input name="due_days" type="number" min={0} max={120} defaultValue={s.due_days} className="input mt-1" />
      </label>
      <button type="submit" disabled={pending} className="btn-secondary btn-sm">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

// Settings > Business lines: what each line's invoices use.
export default function LineSettingsForm({ settings }: { settings: LineSettings[] }) {
  return (
    <section id="lines" className="card scroll-mt-24 p-6">
      <h2 className="section-title">Invoice settings per business</h2>
      <p className="mt-1 text-sm text-muted">
        Each business line bills in its own currency, with its own tax and due date. New
        invoices fill these in for you.
      </p>
      {settings.length ? (
        <div className="mt-3 divide-y divide-line/70">
          {settings.map((s) => (
            <LineRow key={s.line} s={s} />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">
          You have one business, so invoices use your business currency. Give a customer or
          service a Business to set things per business.
        </p>
      )}
    </section>
  );
}
