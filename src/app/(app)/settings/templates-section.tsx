"use client";

import { useActionState, useEffect, useState } from "react";
import { mergeTemplates, type SavedTemplate, type Template, type TemplateLang } from "@/lib/templates";
import { resetTemplate, saveTemplate, type TemplateState } from "../templates/actions";
import { EditButton, RowActionForm } from "@/components/row-actions";

const initial: TemplateState = {};

function TemplateForm({ t, lang, onDone }: { t?: Template; lang: TemplateLang; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveTemplate, initial);
  useEffect(() => {
    if (state.savedAt) onDone();
  }, [state.savedAt, onDone]);
  return (
    <form action={action} className="mt-2 space-y-2 rounded-2xl bg-surface-2 p-3">
      <input type="hidden" name="key" value={t?.key ?? ""} />
      <input type="hidden" name="lang" value={lang} />
      <input name="name" defaultValue={t?.name} maxLength={60} required placeholder="Name, e.g. Deposit request" aria-label="Template name" className="input" />
      <input name="subject" defaultValue={t?.subject} maxLength={200} placeholder="Subject" aria-label="Subject" className="input" />
      <textarea name="body" defaultValue={t?.body} rows={7} maxLength={5000} required placeholder="Message" aria-label="Message" className="input leading-6" />
      <div className="flex items-center justify-end gap-2">
        {state.error && <p className="mr-auto text-xs text-red-600">{state.error}</p>}
        <button type="button" onClick={onDone} className="btn-ghost btn-sm">
          Cancel
        </button>
        <button type="submit" disabled={pending} className="btn-primary btn-sm">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

// Settings > Templates: change the built-in quick templates or add your own.
export default function TemplatesSection({ saved }: { saved: SavedTemplate[] }) {
  const [lang, setLang] = useState<TemplateLang>("en");
  const [editing, setEditing] = useState<string | null>(null);
  const templates = mergeTemplates(saved, lang);

  return (
    <section id="templates" className="card scroll-mt-24 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="section-title">Quick templates</h2>
          <p className="mt-1 text-sm text-muted">
            One-click messages in Send email, invoices and AI Messages. Free, no AI credits.
          </p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Language">
          {(["en", "fr"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={`chip ${lang === l ? "chip-active" : ""}`}
            >
              {l === "en" ? "English" : "Français"}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        Fill-ins: {"{first_name} {name} {business} {my_name} {amount} {invoice_number} {due_date} {date} {time} {link}"}
      </p>

      <ul className="mt-3 divide-y divide-line/70">
        {templates.map((t) => {
          const k = `${t.key}-${t.lang}`;
          return (
            <li key={k} className="py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {t.name}
                    {t.builtIn && t.id && <span className="ml-2 text-xs text-muted">(changed)</span>}
                    {!t.builtIn && <span className="ml-2 text-xs text-muted">(yours)</span>}
                  </p>
                  <p className="truncate text-xs text-muted">{t.subject || t.body.split("\n")[0]}</p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <EditButton onClick={() => setEditing(editing === k ? null : k)} open={editing === k} />
                  {t.id && (
                    <RowActionForm
                      action={resetTemplate}
                      fields={{ key: t.key, lang: t.lang }}
                      label={t.builtIn ? "Reset" : "Delete"}
                      icon={t.builtIn ? "copy" : "trash"}
                      danger={!t.builtIn}
                      confirmText={t.builtIn ? `Put "${t.name}" back the way it came?` : `Delete "${t.name}"?`}
                    />
                  )}
                </div>
              </div>
              {editing === k && <TemplateForm t={t} lang={lang} onDone={() => setEditing(null)} />}
            </li>
          );
        })}
      </ul>
      {editing === "new" ? (
        <TemplateForm lang={lang} onDone={() => setEditing(null)} />
      ) : (
        <button type="button" onClick={() => setEditing("new")} className="btn-secondary btn-sm mt-3">
          + Add your own
        </button>
      )}
    </section>
  );
}
