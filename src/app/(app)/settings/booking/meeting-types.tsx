"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import BusinessLineInput from "@/components/business-line-input";
import CopyBookingLink from "@/components/copy-booking-link";
import {
  BOOKING_DURATIONS,
  bookableTypes,
  formatMoneyCents,
  type IntakeQuestion,
  type MeetingType,
  type QuestionKind,
} from "@/lib/booking";
import { deleteMeetingType, saveMeetingType, type BookingFormState } from "./actions";

const LOCATIONS = [
  { value: "video", label: "🎥 Video call", hint: "Your meeting link, e.g. https://meet.google.com/abc-defg-hij" },
  { value: "phone", label: "📞 Phone call", hint: "The number they should call (or leave empty)" },
  { value: "in_person", label: "📍 In person", hint: "The address" },
  { value: "we_call", label: "☎️ I'll call you", hint: "Optional note, e.g. “from 289-384-9925”" },
];

type DraftQuestion = { label: string; kind: QuestionKind; required: boolean; options: string };

function TypeEditor({
  type,
  lines,
  depositOk,
  currency,
  onDone,
}: {
  type: MeetingType | null;
  lines: string[];
  depositOk: boolean;
  currency: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveMeetingType, {} as BookingFormState);
  const [location, setLocation] = useState(type?.location_kind ?? "video");
  const [questions, setQuestions] = useState<DraftQuestion[]>(
    (type?.questions ?? []).map((q: IntakeQuestion) => ({ label: q.label, kind: q.kind, required: q.required, options: q.options.join("\n") }))
  );
  useEffect(() => {
    if (state.savedAt) onDone();
  }, [state.savedAt, onDone]);

  const setQ = (i: number, patch: Partial<DraftQuestion>) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  return (
    <form action={action} className="space-y-4 rounded-xl border border-line bg-surface-2 p-4">
      {type && <input type="hidden" name="id" value={type.id} />}
      <input type="hidden" name="questions" value={JSON.stringify(questions)} />
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <label className="label">
          Name
          <input name="name" required maxLength={80} defaultValue={type?.name ?? ""} placeholder="e.g. Free intro call" className="input mt-1" />
        </label>
        <label className="label">
          Length
          <select name="duration_min" defaultValue={String(type?.duration_min ?? 30)} className="input mt-1">
            {BOOKING_DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d} minutes
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="label block">
        Description <span className="text-subtle">(optional)</span>
        <textarea name="description" rows={2} maxLength={1000} defaultValue={type?.description ?? ""} className="input mt-1" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">
          Where
          <select name="location_kind" value={location} onChange={(e) => setLocation(e.target.value as MeetingType["location_kind"])} className="input mt-1">
            {LOCATIONS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Details <span className="text-subtle">(optional)</span>
          <input
            name="location_detail"
            maxLength={300}
            defaultValue={type?.location_detail ?? ""}
            placeholder={LOCATIONS.find((l) => l.value === location)?.hint}
            className="input mt-1"
          />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">
          Link end <span className="text-subtle">(optional)</span>
          <input name="slug" maxLength={50} defaultValue={type?.slug ?? ""} placeholder="made from the name" className="input mt-1" />
        </label>
        <BusinessLineInput id={`type_line_${type?.id ?? "new"}`} defaultValue={type?.business_line} lines={lines} label="Business line" emptyLabel="Same as the page" />
      </div>

      <div>
        <p className="label">Questions for the visitor</p>
        <div className="mt-2 space-y-2">
          {questions.map((q, i) => (
            <div key={i} className="rounded-lg border border-line bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={q.label}
                  onChange={(e) => setQ(i, { label: e.target.value })}
                  maxLength={200}
                  placeholder="Question"
                  aria-label="Question"
                  className="input flex-1 py-1.5!"
                />
                <select value={q.kind} onChange={(e) => setQ(i, { kind: e.target.value as QuestionKind })} aria-label="Answer type" className="input w-auto! py-1.5!">
                  <option value="short">Short text</option>
                  <option value="long">Long text</option>
                  <option value="choice">Choice</option>
                </select>
                <label className="flex items-center gap-1 text-xs text-ink-2">
                  <input type="checkbox" checked={q.required} onChange={(e) => setQ(i, { required: e.target.checked })} className="h-4 w-4" />
                  Required
                </label>
                <button type="button" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} aria-label="Remove question" className="btn-ghost btn-sm">
                  ✕
                </button>
              </div>
              {q.kind === "choice" && (
                <textarea
                  value={q.options}
                  onChange={(e) => setQ(i, { options: e.target.value })}
                  rows={3}
                  placeholder={"One option per line\nUnder $500\n$500 – $2,000"}
                  aria-label="Options, one per line"
                  className="input mt-2 text-sm"
                />
              )}
            </div>
          ))}
          {questions.length < 10 && (
            <button
              type="button"
              onClick={() => setQuestions((qs) => [...qs, { label: "", kind: "short", required: false, options: "" }])}
              className="btn-ghost btn-sm"
            >
              + Add a question
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={`label ${depositOk ? "" : "opacity-60"}`}>
          Deposit ({currency}) <span className="text-subtle">{depositOk ? "(optional)" : "🔒 Boss"}</span>
          <input
            name="deposit"
            type="number"
            min={0}
            step="0.01"
            disabled={!depositOk}
            defaultValue={type?.deposit_cents ? (type.deposit_cents / 100).toFixed(2) : ""}
            className="input mt-1"
          />
          <span className="mt-1 block text-xs font-normal text-muted">
            Shown on the page and in the email; you send the payment link. Card payment at booking isn&apos;t switched on yet.
          </span>
        </label>
        <label className="flex items-center gap-2 self-center text-sm font-medium text-ink-2">
          <input type="hidden" name="active" value="off" />
          <input type="checkbox" name="active" defaultChecked={type?.active ?? true} className="h-4 w-4" />
          Live (people can book it)
        </label>
      </div>

      {state.error && (
        <p className="alert-error text-sm">
          {state.error}{" "}
          {state.upgrade && (
            <Link href="/settings#plan" className="link">
              Upgrade
            </Link>
          )}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onDone} className="btn-ghost">
          Cancel
        </button>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Saving…" : type ? "Save" : "Add meeting type"}
        </button>
      </div>
    </form>
  );
}

export default function MeetingTypes({
  types,
  lines,
  limit,
  depositOk,
  base,
  slug,
  enabled,
  currency,
}: {
  types: MeetingType[];
  lines: string[];
  limit: number | null;
  depositOk: boolean;
  base: string;
  slug: string | null;
  enabled: boolean;
  currency: string;
}) {
  const [editing, setEditing] = useState<string | null>(types.length === 0 ? "new" : null);
  const live = new Set(bookableTypes(types, limit).map((t) => t.id));
  const activeCount = types.filter((t) => t.active).length;

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="section-title">🤝 Meeting types</h2>
          <p className="page-sub">
            Each one is its own link.{" "}
            {limit === null ? "Your plan has unlimited links." : limit === 0 ? "Links come with Hustle." : `Your plan has ${limit} live link.`}
          </p>
        </div>
        {editing !== "new" && (
          <button type="button" onClick={() => setEditing("new")} className="btn-primary btn-sm">
            + New meeting type
          </button>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {editing === "new" && (
          <TypeEditor type={null} lines={lines} depositOk={depositOk} currency={currency} onDone={() => setEditing(null)} />
        )}
        {types.map((t) =>
          editing === t.id ? (
            <TypeEditor key={t.id} type={t} lines={lines} depositOk={depositOk} currency={currency} onDone={() => setEditing(null)} />
          ) : (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4">
              <div className="min-w-0">
                <p className="font-semibold text-ink">
                  {t.name}{" "}
                  {!t.active ? (
                    <span className="chip ml-1 text-[10px]">Off</span>
                  ) : !live.has(t.id) ? (
                    <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Over plan limit</span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  {t.duration_min} min · {LOCATIONS.find((l) => l.value === t.location_kind)?.label}
                  {t.questions.length ? ` · ${t.questions.length} question${t.questions.length === 1 ? "" : "s"}` : ""}
                  {t.deposit_cents ? ` · deposit ${formatMoneyCents(t.deposit_cents, currency)}` : ""}
                </p>
                {slug && (
                  <p className="mt-0.5 truncate text-xs text-subtle">
                    {base}/book/{slug}/{t.slug}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {slug && enabled && live.has(t.id) && (
                  <>
                    <CopyBookingLink url={`${base}/book/${slug}/${t.slug}`} label="Copy link" className="btn-secondary btn-sm" />
                    <a href={`/book/${slug}/${t.slug}`} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">
                      Open
                    </a>
                  </>
                )}
                <button type="button" onClick={() => setEditing(t.id)} className="btn-ghost btn-sm">
                  Edit
                </button>
                <form
                  action={deleteMeetingType}
                  onSubmit={(e) => {
                    if (!confirm(`Delete "${t.name}"? Its link stops working. Past bookings stay.`)) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" className="btn-ghost btn-sm text-red-600">
                    Delete
                  </button>
                </form>
              </div>
            </div>
          )
        )}
        {types.length === 0 && editing !== "new" && <p className="text-sm text-muted">No meeting types yet.</p>}
        {limit !== null && activeCount > limit && (
          <p className="alert-warn text-sm">
            You have {activeCount} live meeting types but your plan allows {limit}. Only the first {limit} can be booked.
          </p>
        )}
      </div>
    </section>
  );
}
