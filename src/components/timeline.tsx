import {
  ACTIVITY_KINDS,
  summarizeActivities,
  type Activity,
} from "@/lib/activities";
import { lineLabel } from "@/lib/business-lines";
import { deleteActivity, updateActivity } from "@/app/(app)/activities/actions";
import EditableRow from "./editable-row";
import LocalTime from "./local-time";
import AddActivityForm from "./add-activity-form";

const KIND_META = Object.fromEntries(ACTIVITY_KINDS.map((k) => [k.value, k]));

const SOURCE_LABEL: Record<string, string> = {
  mailer: "mailer",
  gmail: "Gmail",
  phone_line: "phone line",
  import: "imported",
};

// Everything that happened with one customer or lead, newest first.
export default function Timeline({
  activities,
  customerId,
  leadId,
  missing,
  nowIso,
}: {
  activities: Activity[];
  // current time, from the page (keeps this component pure)
  nowIso: string;
  customerId?: string;
  leadId?: string;
  // true when the activities table isn't there yet (0014 not run)
  missing?: boolean;
}) {
  if (missing) {
    return (
      <p className="alert-warn">
        The timeline isn&apos;t set up yet — run migration 0014 in Supabase.
      </p>
    );
  }

  const { parts, lastContact } = summarizeActivities(activities);

  return (
    <div>
      <p className="text-sm text-slate-600">
        {parts.join(" · ")}
        {lastContact ? (
          <>
            {" "}
            · last contact <LocalTime iso={lastContact} mode="date" />
          </>
        ) : (
          " · no contact yet"
        )}
      </p>

      <div className="mt-4">
        <AddActivityForm customerId={customerId} leadId={leadId} />
      </div>

      {activities.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          Nothing on the timeline yet. Emails, calls, notes, files, tasks and
          invoices for this contact show up here.
        </p>
      ) : (
        <ol className="mt-4 space-y-3">
          {activities.map((a) => {
            const meta = KIND_META[a.kind];
            const upcoming =
              new Date(a.occurred_at).getTime() > new Date(nowIso).getTime();
            return (
              <EditableRow
                key={a.id}
                id={a.id}
                className="rounded-lg bg-slate-50 px-4 py-3"
                updateAction={updateActivity}
                deleteAction={deleteActivity}
                what="this timeline entry"
                fields={[
                  { name: "subject", label: "Title", type: "text", defaultValue: a.subject, wide: true },
                  { name: "body", label: "Text", type: "textarea", defaultValue: a.body },
                ]}
              >
                <span className="mt-0.5 text-base" aria-hidden>
                  {meta?.icon ?? "•"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800">
                    <span className="font-medium">{meta?.label ?? a.kind}</span>
                    {a.subject && (
                      <span className="text-slate-700"> — {a.subject}</span>
                    )}
                    {upcoming && (
                      <span className="ml-2 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-600">
                        upcoming
                      </span>
                    )}
                  </p>
                  {a.body &&
                    (a.body.length > 240 ? (
                      <details className="mt-1 text-sm text-slate-600">
                        <summary className="cursor-pointer text-slate-500">
                          {a.body.slice(0, 200)}… <span className="text-indigo-600">more</span>
                        </summary>
                        <p className="mt-1 whitespace-pre-line">{a.body}</p>
                      </details>
                    ) : (
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-600">
                        {a.body}
                      </p>
                    ))}
                  <p className="mt-1 text-xs text-slate-400">
                    <LocalTime iso={a.occurred_at} />
                    {a.business_line && <> · {lineLabel(a.business_line)}</>}
                    {SOURCE_LABEL[a.source] && <> · {SOURCE_LABEL[a.source]}</>}
                  </p>
                </div>
              </EditableRow>
            );
          })}
        </ol>
      )}
    </div>
  );
}
