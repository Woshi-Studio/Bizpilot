import Link from "next/link";
import { requireUserAndBusiness } from "@/lib/data";
import { LEAD_CHANNELS, LEAD_STATUSES, type Lead } from "@/lib/types";
import { convertLead, deleteLead, setLeadStatus } from "./actions";
import OutreachForm from "./outreach-form";

export const metadata = { title: "Leads" };

const CHANNEL_LABEL = Object.fromEntries(
  LEAD_CHANNELS.map((c) => [c.value, c.label])
);

export default async function LeadsPage() {
  const { supabase, business } = await requireUserAndBusiness();

  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });

  const leads = (data ?? []) as Lead[];
  const pageEnabled =
    (business as { public_page_enabled?: boolean }).public_page_enabled ??
    false;
  const slug = (business as { slug?: string | null }).slug ?? null;

  const today = new Date().toISOString().slice(0, 10);
  const dueFollowUps = leads.filter(
    (l) => l.follow_up_date && l.follow_up_date <= today && l.status !== "converted" && l.status !== "declined"
  );
  const total = leads.length;
  const contacted = leads.filter((l) => l.status !== "new").length;
  const converted = leads.filter((l) => l.status === "converted").length;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
      <p className="mt-1 text-sm text-slate-500">
        Everyone you&apos;ve reached out to, and everyone who&apos;s reached out to
        you.
      </p>

      {error ? (
        <p className="mt-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Leads aren&apos;t set up yet — the database migration for this
          feature hasn&apos;t been run.
        </p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
              <p className="text-xl font-bold text-slate-900">{total}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                Total
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
              <p className="text-xl font-bold text-blue-600">{contacted}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                In progress
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
              <p className="text-xl font-bold text-green-600">{converted}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                Converted
              </p>
            </div>
          </div>

          {!pageEnabled && (
            <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
              Your public page is off, so inbound leads won&apos;t come in
              automatically. Turn it on in{" "}
              <Link
                href="/settings"
                className="font-medium text-indigo-600 hover:text-indigo-500"
              >
                Settings
              </Link>
              . You can still log outreach manually below.
            </p>
          )}

          {dueFollowUps.length > 0 && (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h2 className="text-sm font-semibold text-amber-800">
                Follow-ups due
              </h2>
              <ul className="mt-2 space-y-1 text-sm text-amber-700">
                {dueFollowUps.map((l) => (
                  <li key={l.id}>
                    {l.name} — {l.follow_up_date}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6">
            <OutreachForm />
          </div>

          {leads.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="text-sm font-medium text-slate-600">
                No leads yet.
              </p>
              {slug && (
                <p className="mt-1 text-sm text-slate-400">
                  Share your page:{" "}
                  <Link
                    href={`/b/${slug}`}
                    className="font-medium text-indigo-600 hover:text-indigo-500"
                  >
                    /b/{slug}
                  </Link>
                </p>
              )}
            </div>
          ) : (
            <ul className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {leads.map((lead) => (
                <li key={lead.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">
                        {lead.name}
                        <span className="ml-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          {CHANNEL_LABEL[lead.channel] ?? lead.channel}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {[lead.email, lead.phone].filter(Boolean).join(" · ") ||
                          "No contact info"}{" "}
                        · {new Date(lead.created_at).toLocaleString()}
                        {lead.follow_up_date && (
                          <> · Follow up: {lead.follow_up_date}</>
                        )}
                      </p>
                      {lead.message && (
                        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          {lead.message}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <form action={setLeadStatus}>
                        <input type="hidden" name="id" value={lead.id} />
                        <select
                          name="status"
                          defaultValue={lead.status}
                          onChange={(e) => e.currentTarget.form?.requestSubmit()}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                        >
                          {LEAD_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </form>
                      {lead.status !== "converted" && (
                        <form action={convertLead}>
                          <input type="hidden" name="id" value={lead.id} />
                          <button
                            type="submit"
                            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
                          >
                            + Add to customers
                          </button>
                        </form>
                      )}
                      <form action={deleteLead}>
                        <input type="hidden" name="id" value={lead.id} />
                        <button
                          type="submit"
                          className="text-xs text-slate-300 hover:text-red-500"
                        >
                          delete
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
