"use client";

import { useEffect, useState } from "react";
import { fillTemplate, mergeTemplates, type SavedTemplate, type TemplateLang, type TemplateVars } from "@/lib/templates";
import { listTemplates } from "@/app/(app)/templates/actions";

// One-click message starters (free, no AI). Filled with the contact's
// name, the business, amounts and dates. Edit them in Settings → Templates.
export default function TemplateChips({
  vars,
  onPick,
  only,
  className = "",
}: {
  vars: TemplateVars;
  onPick: (subject: string, body: string) => void;
  only?: string[]; // limit to these built-in keys (own templates always show)
  className?: string;
}) {
  const [saved, setSaved] = useState<SavedTemplate[]>([]);
  const [lang, setLang] = useState<TemplateLang>("en");

  useEffect(() => {
    let live = true;
    listTemplates()
      .then((rows) => {
        if (live) setSaved(rows);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const templates = mergeTemplates(saved, lang).filter(
    (t) => !only || !t.builtIn || only.includes(t.key)
  );

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink-2">Quick start (free)</p>
        <div className="flex gap-1 text-[11px]" role="group" aria-label="Template language">
          {(["en", "fr"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={`rounded px-1.5 py-0.5 font-semibold uppercase ${lang === l ? "bg-surface-3 text-ink" : "text-muted hover:text-ink"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {templates.map((t) => (
          <button
            key={`${t.key}-${t.lang}`}
            type="button"
            onClick={() => onPick(fillTemplate(t.subject, vars), fillTemplate(t.body, vars))}
            className="chip text-xs"
          >
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}
