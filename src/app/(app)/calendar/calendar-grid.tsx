"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { lineLabel } from "@/lib/business-lines";
import Icon from "@/components/icons";
import DateChips from "@/components/date-chips";
import SendEmailDialog from "@/components/send-email-dialog";
import { BUILT_IN, fillTemplate } from "@/lib/templates";
import { deleteActivity } from "@/app/(app)/activities/actions";
import { deleteTask } from "@/app/(app)/tasks/actions";
import { markEntryDone, saveCalendarEntry, type CalendarState, type EntryType } from "./actions";
import { setBookingStatus } from "@/app/(app)/bookings/actions";

export type CalendarContact = { kind: "customer" | "lead"; id: string; name: string; email: string | null };

export type CalendarItem = {
  key: string;
  kind: "task" | "lead" | "customer" | "invoice" | "meeting" | "call" | "reminder" | "block";
  title: string;
  // all-day items carry a date ("YYYY-MM-DD"); timed ones a timestamp
  date?: string | null;
  at?: string | null;
  endsAt?: string | null;
  href: string | null;
  done?: boolean;
  line?: string | null;
  // what the side panel can do
  source?: "activity" | "task";
  id?: string;
  notes?: string | null;
  contact?: CalendarContact | null;
  // made on the public booking page (0018)
  booking?: { id: string | null; status: string };
};

const BOOKING_STATUS: Record<string, string> = {
  confirmed: "Booked",
  attended: "Attended",
  no_show: "No-show",
  cancelled: "Cancelled",
};

export const CALENDAR_NEW_EVENT = "jephelen-calendar-new";

const KIND_STYLE: Record<CalendarItem["kind"], { icon: string; cls: string; label: string }> = {
  task: { icon: "✅", cls: "bg-slate-50 text-slate-700 border-slate-200", label: "Task due" },
  lead: { icon: "📣", cls: "bg-amber-50 text-amber-800 border-amber-200", label: "Lead follow-up" },
  customer: { icon: "👋", cls: "bg-green-50 text-green-800 border-green-200", label: "Customer follow-up" },
  invoice: { icon: "🧾", cls: "bg-blue-50 text-blue-800 border-blue-200", label: "Invoice due" },
  meeting: { icon: "🤝", cls: "bg-indigo-50 text-indigo-800 border-indigo-200", label: "Meeting" },
  call: { icon: "📞", cls: "bg-indigo-50 text-indigo-800 border-indigo-200", label: "Call" },
  reminder: { icon: "⏰", cls: "bg-amber-50 text-amber-800 border-amber-200", label: "Reminder" },
  block: { icon: "⛔", cls: "bg-slate-100 text-slate-500 border-slate-200 border-dashed", label: "Blocked time" },
};

const TYPE_OPTIONS: { value: EntryType; label: string }[] = [
  { value: "meeting", label: "🤝 Meeting" },
  { value: "call", label: "📞 Call" },
  { value: "reminder", label: "⏰ Reminder" },
  { value: "block", label: "⛔ Personal / blocked time" },
  { value: "task", label: "✅ Task due" },
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7:00 – 21:00

const noopSubscribe = () => () => {};
const pad = (n: number) => String(n).padStart(2, "0");

// The browser's own calendar day for a timestamp. During the server
// render (and hydration) we use the UTC day, then switch to local.
function localDay(iso: string, isClient: boolean) {
  if (!isClient) return iso.slice(0, 10);
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function localTime(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Draft = {
  id?: string;
  type: EntryType;
  title: string;
  date: string;
  time: string;
  endTime: string;
  notes: string;
  contact: string; // "customer:<id>" / "lead:<id>" / ""
};

function EntryDialog({
  draft,
  contacts,
  onClose,
}: {
  draft: Draft;
  contacts: CalendarContact[];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(saveCalendarEntry, {} as CalendarState);
  const ref = useRef<HTMLDialogElement>(null);
  const [d, setD] = useState(draft);

  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    if (state.savedAt) onClose();
  }, [state.savedAt, onClose]);

  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const timed = d.type !== "task";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius-card)] bg-surface p-0 text-ink shadow-pop backdrop:bg-black/40"
    >
      <form
        action={(fd: FormData) => {
          fd.set("tz_offset", String(new Date().getTimezoneOffset()));
          action(fd);
        }}
        className="space-y-3 p-5"
      >
        {d.id && <input type="hidden" name="id" value={d.id} />}
        <div className="flex items-center justify-between">
          <h2 className="section-title">{d.id ? "Edit" : "Add to calendar"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-surface-3">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <label className="label">
          What
          <select
            name="type"
            value={d.type}
            onChange={(e) => set({ type: e.target.value as EntryType })}
            disabled={!!d.id && d.type === "task"}
            className="input mt-1"
          >
            {TYPE_OPTIONS.filter((o) => !d.id || o.value !== "task").map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Title
          <input
            name="title"
            required
            autoFocus
            maxLength={300}
            value={d.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder={d.type === "block" ? "e.g. Lunch, school run, day off" : "e.g. Call with Greg"}
            className="input mt-1"
          />
        </label>
        <div className={`grid gap-3 ${timed ? "grid-cols-3" : "grid-cols-1"}`}>
          <label className="label">
            Date
            <input name="date" type="date" required value={d.date} onChange={(e) => set({ date: e.target.value })} className="input mt-1" />
          </label>
          {timed && (
            <>
              <label className="label">
                Start
                <input name="time" type="time" value={d.time} onChange={(e) => set({ time: e.target.value })} className="input mt-1" />
              </label>
              <label className="label">
                End <span className="text-subtle">(optional)</span>
                <input name="end_time" type="time" value={d.endTime} onChange={(e) => set({ endTime: e.target.value })} className="input mt-1" />
              </label>
            </>
          )}
        </div>
        <DateChips withTime={timed} onPick={(date, time) => set({ date, ...(time ? { time } : {}) })} />
        {d.type !== "block" && (
          <label className="label">
            With <span className="text-subtle">(optional)</span>
            <select name="contact" value={d.contact} onChange={(e) => set({ contact: e.target.value })} className="input mt-1">
              <option value="">No one</option>
              {contacts.some((c) => c.kind === "customer") && (
                <optgroup label="Customers">
                  {contacts.filter((c) => c.kind === "customer").map((c) => (
                    <option key={c.id} value={`customer:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {d.type !== "task" && contacts.some((c) => c.kind === "lead") && (
                <optgroup label="Leads">
                  {contacts.filter((c) => c.kind === "lead").map((c) => (
                    <option key={c.id} value={`lead:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
        )}
        <label className="label">
          Notes <span className="text-subtle">(optional)</span>
          <textarea name="notes" rows={2} value={d.notes} onChange={(e) => set({ notes: e.target.value })} className="input mt-1" />
        </label>
        {d.type === "block" && (
          <p className="text-xs text-muted">Blocked time shows greyed out. Your booking page won&apos;t offer these times.</p>
        )}
        {state.error && <p className="alert-error text-sm">{state.error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Saving…" : d.id ? "Save" : "Add"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function SidePanel({
  item,
  onClose,
  onEdit,
  businessName,
  canSend,
}: {
  item: CalendarItem;
  onClose: () => void;
  onEdit: () => void;
  businessName: string;
  canSend: boolean;
}) {
  const style = KIND_STYLE[item.kind];
  const [confirming, setConfirming] = useState(false);
  const when = item.at
    ? new Date(item.at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : item.date;
  const tpl = BUILT_IN.en.find((t) => t.key === "meeting_confirm")!;
  const vars = {
    first_name: item.contact?.name.split(" ")[0],
    business: businessName,
    date: item.at ? new Date(item.at).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : item.date ?? undefined,
    time: item.at ? new Date(item.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : undefined,
  };
  const deletable = item.source === "activity" || item.source === "task";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside
        role="dialog"
        aria-label={item.title}
        className="fixed inset-y-0 right-0 z-50 flex w-[min(24rem,100vw)] flex-col border-l border-line bg-surface p-5 shadow-pop"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="eyebrow">
              {style.icon} {style.label}
            </p>
            <h2 className="section-title mt-1 text-lg!">{item.title}</h2>
            <p className="mt-1 text-sm text-muted">
              {when}
              {item.endsAt && ` – ${new Date(item.endsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}
              {item.line && ` · ${lineLabel(item.line)}`}
            </p>
            {item.done && !item.booking && <p className="mt-1 text-xs font-semibold text-green-600">Done</p>}
            {item.booking && (
              <p className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-text">🌐 Booked online</span>
                <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-ink-2">
                  {BOOKING_STATUS[item.booking.status] ?? item.booking.status}
                </span>
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-surface-3">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        {item.contact && <p className="mt-4 text-sm text-ink-2">With {item.contact.name}</p>}
        {item.notes && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-sm text-ink-2">{item.notes}</p>}

        {item.booking?.id && (
          <div className="mt-5 flex flex-wrap gap-2">
            {(["attended", "no_show"] as const)
              .filter((st) => st !== item.booking!.status)
              .map((st) => (
                <form key={st} action={setBookingStatus} onSubmit={() => setTimeout(onClose, 50)}>
                  <input type="hidden" name="id" value={item.booking!.id!} />
                  <input type="hidden" name="status" value={st} />
                  <button type="submit" className="btn-secondary btn-sm">
                    {st === "attended" ? "✅ Attended" : "🚫 No-show"}
                  </button>
                </form>
              ))}
            <Link href="/bookings" className="btn-ghost btn-sm">
              All bookings
            </Link>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {item.source === "activity" && !item.booking && (
            <button type="button" onClick={onEdit} className="btn-secondary btn-sm">
              <Icon name="edit" className="h-4 w-4" />
              Edit
            </button>
          )}
          {deletable && !item.done && !item.booking && item.kind !== "block" && (
            <form action={markEntryDone} onSubmit={() => setTimeout(onClose, 50)}>
              <input type="hidden" name="source" value={item.source} />
              <input type="hidden" name="id" value={item.id} />
              <button type="submit" className="btn-secondary btn-sm">
                <Icon name="check" className="h-4 w-4" />
                Mark done
              </button>
            </form>
          )}
          {item.href && (
            <Link href={item.href} className="btn-secondary btn-sm">
              Open {item.contact ? "contact" : item.kind === "invoice" ? "invoice" : ""}
            </Link>
          )}
          {item.contact?.email && (item.kind === "meeting" || item.kind === "call") && (
            <button type="button" onClick={() => setConfirming(true)} className="btn-primary btn-sm">
              <Icon name="send" className="h-4 w-4" />
              Send confirmation
            </button>
          )}
          {deletable && !item.booking && (
            <form
              action={item.source === "task" ? deleteTask : deleteActivity}
              onSubmit={(e) => {
                if (!confirm(`Delete "${item.title}"? This can't be undone.`)) e.preventDefault();
                else setTimeout(onClose, 50);
              }}
            >
              <input type="hidden" name="id" value={item.id} />
              <button type="submit" className="btn-ghost btn-sm text-red-600">
                <Icon name="trash" className="h-4 w-4" />
                Delete
              </button>
            </form>
          )}
        </div>
        {!canSend && item.contact?.email && (item.kind === "meeting" || item.kind === "call") && (
          <p className="mt-3 text-xs text-muted">Send confirmation opens a message you can send from your own email.</p>
        )}
      </aside>
      {confirming && item.contact && (
        canSend ? (
          <SendEmailDialog
            open
            onClose={() => setConfirming(false)}
            contact={{ kind: item.contact.kind, id: item.contact.id, name: item.contact.name, email: item.contact.email }}
            subject={fillTemplate(tpl.subject, vars)}
            body={fillTemplate(tpl.body, vars)}
            vars={vars}
          />
        ) : (
          <MailtoRedirect
            href={`mailto:${encodeURIComponent(item.contact.email ?? "").replace(/%40/g, "@")}?subject=${encodeURIComponent(fillTemplate(tpl.subject, vars))}&body=${encodeURIComponent(fillTemplate(tpl.body, vars))}`}
            onDone={() => setConfirming(false)}
          />
        )
      )}
    </>
  );
}

function MailtoRedirect({ href, onDone }: { href: string; onDone: () => void }) {
  useEffect(() => {
    window.location.href = href;
    onDone();
  }, [href, onDone]);
  return null;
}

export default function CalendarGrid({
  days,
  month,
  view,
  items,
  contacts = [],
  businessName = "",
  canSend = false,
  prefillContact,
}: {
  days: string[];
  // "YYYY-MM" in month view (days outside it are dimmed), null otherwise
  month: string | null;
  view?: "month" | "week" | "day";
  items: CalendarItem[];
  contacts?: CalendarContact[];
  businessName?: string;
  canSend?: boolean;
  prefillContact?: string;
}) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftN, setDraftN] = useState(0);
  const [selected, setSelected] = useState<CalendarItem | null>(null);

  const today = localDay(new Date().toISOString(), isClient);

  function openNew(date: string, time = "", contact = "") {
    setSelected(null);
    setDraftN((n) => n + 1);
    setDraft({ type: "meeting", title: "", date, time, endTime: "", notes: "", contact });
  }

  // "+ New" in the page header, and "Book meeting" links from a contact.
  useEffect(() => {
    const onNew = () => openNew(new Date().toISOString().slice(0, 10), "10:00");
    window.addEventListener(CALENDAR_NEW_EVENT, onNew);
    return () => window.removeEventListener(CALENDAR_NEW_EVENT, onNew);
  }, []);
  const [prefillDone, setPrefillDone] = useState(false);
  if (prefillContact && !prefillDone && isClient) {
    setPrefillDone(true);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    setDraftN((n) => n + 1);
    setDraft({
      type: "meeting",
      title: `Meeting with ${contacts.find((c) => `${c.kind}:${c.id}` === prefillContact)?.name ?? ""}`.trim(),
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: "10:00",
      endTime: "",
      notes: "",
      contact: prefillContact,
    });
  }

  function editItem(item: CalendarItem) {
    if (!item.id || !item.at) return;
    setSelected(null);
    setDraftN((n) => n + 1);
    setDraft({
      id: item.id,
      type: item.kind as EntryType,
      title: item.title,
      date: localDay(item.at, true),
      time: localTime(item.at),
      endTime: item.endsAt ? localTime(item.endsAt) : "",
      notes: item.notes ?? "",
      contact: item.contact ? `${item.contact.kind}:${item.contact.id}` : "",
    });
  }

  const byDay = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const day = item.at ? localDay(item.at, isClient) : item.date;
    if (!day) continue;
    const list = byDay.get(day) ?? [];
    list.push(item);
    byDay.set(day, list);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => {
      if (a.at && b.at) return a.at.localeCompare(b.at);
      if (a.at) return -1;
      if (b.at) return 1;
      return a.title.localeCompare(b.title);
    });
  }

  const chip = (item: CalendarItem) => {
    const style = KIND_STYLE[item.kind];
    const time = item.at && isClient
      ? new Date(item.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
      : null;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setSelected(item);
        }}
        title={`${item.title}${item.line ? ` · ${lineLabel(item.line)}` : ""}`}
        className={`block w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] leading-snug hover:opacity-80 ${style.cls} ${
          item.done ? "line-through opacity-60" : ""
        }`}
      >
        {style.icon} {time && <b className="font-semibold">{time} </b>}
        {item.booking && <span title="Booked online">🌐 </span>}
        {item.title}
      </button>
    );
  };

  const dialogs = (
    <>
      {draft && <EntryDialog key={draftN} draft={draft} contacts={contacts} onClose={() => setDraft(null)} />}
      {selected && (
        <SidePanel
          item={selected}
          onClose={() => setSelected(null)}
          onEdit={() => editItem(selected)}
          businessName={businessName}
          canSend={canSend}
        />
      )}
    </>
  );

  if (view === "day") {
    const day = days[0];
    const list = byDay.get(day) ?? [];
    const allDay = list.filter((i) => !i.at);
    const timed = list.filter((i) => i.at);
    return (
      <div className="card overflow-hidden">
        {allDay.length > 0 && (
          <div className="space-y-1 border-b border-line p-3">
            <p className="eyebrow">All day</p>
            {allDay.map((i) => (
              <div key={i.key}>{chip(i)}</div>
            ))}
          </div>
        )}
        <ol>
          {HOURS.map((h) => {
            const inHour = timed.filter((i) => isClient && new Date(i.at!).getHours() === h);
            const early = h === 7 ? timed.filter((i) => isClient && new Date(i.at!).getHours() < 7) : [];
            const late = h === 21 ? timed.filter((i) => isClient && new Date(i.at!).getHours() > 21) : [];
            const here = [...early, ...inHour, ...late];
            return (
              <li
                key={h}
                onClick={() => openNew(day, `${pad(h)}:00`)}
                className="flex min-h-12 cursor-pointer gap-3 border-b border-line/60 px-3 py-1.5 hover:bg-surface-2"
              >
                <span className="w-14 shrink-0 pt-0.5 text-xs text-muted">
                  {`${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`}
                </span>
                <div className="flex-1 space-y-1">
                  {here.map((i) => (
                    <div key={i.key}>{chip(i)}</div>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
        {dialogs}
      </div>
    );
  }

  const week = !month;

  return (
    <div className="overflow-hidden card">
      <div className="hidden grid-cols-7 border-b border-slate-200 bg-slate-50 sm:grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-7">
        {days.map((day) => {
          const list = byDay.get(day) ?? [];
          const outside = month !== null && !day.startsWith(month);
          const isToday = day === today;
          const hideOnMobile = !week && list.length === 0;
          return (
            <div
              key={day}
              onClick={() => openNew(day, week ? "10:00" : "")}
              title="Click to add something on this day"
              className={`cursor-pointer border-b border-slate-100 p-1.5 transition-colors hover:bg-surface-2 sm:border-r ${
                week ? "sm:min-h-64" : "sm:min-h-28"
              } ${outside ? "bg-slate-50/60" : ""} ${hideOnMobile ? "hidden sm:block" : ""}`}
            >
              <p
                className={`mb-1 text-xs font-medium ${
                  isToday
                    ? "inline-block rounded-full bg-indigo-600 px-1.5 text-white"
                    : outside
                      ? "text-slate-300"
                      : "text-slate-500"
                }`}
              >
                <span className="sm:hidden">{WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]} </span>
                {Number(day.slice(8, 10))}
              </p>
              <ul className="space-y-1">
                {list.map((item) => (
                  <li key={item.key}>{chip(item)}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {dialogs}
    </div>
  );
}
