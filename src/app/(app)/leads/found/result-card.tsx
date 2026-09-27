"use client";

import Link from "next/link";
import { useActionState } from "react";
import FormError from "@/components/form-error";
import {
  emailCheckText,
  freshness,
  outreachTemplate,
  phoneCheckText,
  safeHttpUrl,
  telHref,
  visibleResult,
  type FinderResult,
} from "@/lib/finder";
import { mailtoHref } from "@/lib/mailto";
import { addFoundToLeads, reportFound, type FinderFormState } from "./actions";

const initial: FinderFormState = {};

const BADGE: Record<string, string> = {
  fresh: "border-green-200 bg-green-50 text-green-700",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  grey: "border-slate-200 bg-slate-100 text-slate-500",
};

function day(iso: string) {
  return iso.slice(0, 10);
}

export default function ResultCard({
  result,
  sender,
  reportedStatus,
}: {
  result: FinderResult;
  sender: { name: string | null; business: string; offer: string | null };
  reportedStatus: string | null;
}) {
  const r = visibleResult(result);
  const [addState, addAction, adding] = useActionState(addFoundToLeads, initial);
  const [repState, repAction, reporting] = useActionState(reportFound, initial);

  const website = safeHttpUrl(r.website);
  const form = safeHttpUrl(r.contact_form_url);
  const tel = telHref(r.phone);
  const tpl = outreachTemplate({
    company: r.company_name,
    website,
    senderName: sender.name,
    senderBusiness: sender.business,
    offer: sender.offer,
  });
  const fresh = freshness(r.last_checked_at);
  const sources = r.source_urls.map((s) => safeHttpUrl(s)).filter((s): s is string => !!s);
  const place = [r.city, r.region, r.country].filter(Boolean).join(", ");
  const added = !!r.lead_id || !!addState.success;

  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="section-title break-words">{r.company_name}</p>
          <p className="mt-0.5 text-xs text-muted">
            {[place, r.address].filter(Boolean).join(" · ") || "Location not listed"}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${BADGE[fresh]}`}>
          Last checked {day(r.last_checked_at)}
        </span>
      </div>

      {r.why && <p className="mt-3 text-sm text-ink-2">{r.why}</p>}

      {r.locked ? (
        <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
          Contacts are hidden until you unlock this result.
        </p>
      ) : (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {r.phone && (
            <div className="min-w-0">
              <dt className="text-xs font-medium text-muted">Phone</dt>
              <dd className="font-medium text-ink">{r.phone}</dd>
              <dd className="text-xs text-muted">{phoneCheckText(r.phone_checks)}</dd>
            </div>
          )}
          {r.email && (
            <div className="min-w-0">
              <dt className="text-xs font-medium text-muted">Email</dt>
              <dd className="break-all font-medium text-ink">{r.email}</dd>
              <dd className="text-xs text-muted">{emailCheckText(r.email_checks)}</dd>
            </div>
          )}
          {website && (
            <div className="min-w-0">
              <dt className="text-xs font-medium text-muted">Website</dt>
              <dd className="truncate">
                <a href={website} target="_blank" rel="noopener noreferrer nofollow" className="link">
                  {website.replace(/^https?:\/\//, "")}
                </a>
              </dd>
            </div>
          )}
          {form && (
            <div className="min-w-0">
              <dt className="text-xs font-medium text-muted">Contact form</dt>
              <dd className="truncate">
                <a href={form} target="_blank" rel="noopener noreferrer nofollow" className="link">
                  Open their contact form
                </a>
              </dd>
            </div>
          )}
        </dl>
      )}

      {sources.length > 0 && (
        <p className="mt-3 truncate text-xs text-muted">
          Source:{" "}
          <a href={sources[0]} target="_blank" rel="noopener noreferrer nofollow" className="link">
            {sources[0].replace(/^https?:\/\//, "")}
          </a>
          {sources.length > 1 && ` +${sources.length - 1} more`}
        </p>
      )}

      {!r.locked && (
        <div className="mt-4 flex flex-wrap gap-2">
          {tel && (
            <a href={tel} className="btn-secondary btn-sm">
              Call
            </a>
          )}
          {r.email && (
            <a href={mailtoHref(r.email, tpl.subject, tpl.body)} className="btn-secondary btn-sm">
              Email
            </a>
          )}
          {added ? (
            <Link href={r.lead_id ? `/leads/${r.lead_id}` : "/leads"} className="btn-ghost btn-sm">
              In your leads ✓
            </Link>
          ) : (
            <form action={addAction}>
              <input type="hidden" name="result_id" value={r.id} />
              <button type="submit" disabled={adding} className="btn-primary btn-sm">
                {adding ? "Adding..." : "+ Add to leads"}
              </button>
            </form>
          )}
        </div>
      )}
      <FormError error={addState.error} upgrade={addState.upgrade} className="mt-3" />

      {r.email && !r.locked && (
        <p className="mt-2 text-xs text-muted">
          The Email button opens your own email app with a first message that says who you are and
          how to opt out. Fill in the [brackets] before sending.
        </p>
      )}

      {!r.locked &&
        (reportedStatus || repState.success ? (
          <p className="mt-3 text-xs text-muted">{repState.success ?? "Reported. Thanks."}</p>
        ) : (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-muted hover:text-ink">
              Report bounce / wrong number
            </summary>
            <form action={repAction} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="result_id" value={r.id} />
              <select name="kind" aria-label="What went wrong" className="input w-auto" defaultValue={r.email ? "bounce" : "wrong_number"}>
                {r.email && <option value="bounce">The email bounced</option>}
                {r.phone && <option value="wrong_number">Wrong or dead number</option>}
                <option value="other">Something else is wrong</option>
              </select>
              <input name="note" maxLength={500} placeholder="What happened (optional)" className="input min-w-0 flex-1" />
              <button type="submit" disabled={reporting} className="btn-secondary btn-sm">
                {reporting ? "Sending..." : "Report"}
              </button>
            </form>
            <FormError error={repState.error} className="mt-2" />
          </details>
        ))}
    </li>
  );
}
