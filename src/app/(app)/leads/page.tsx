import Link from "next/link";
import { requireUserAndBusiness } from "@/lib/data";
import type { Lead } from "@/lib/types";
import { convertLead, deleteLead } from "./actions";

export const metadata = { title: "Leads" };

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

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
      <p className="mt-1 text-sm text-slate-500">
        People who reached out through your public page.
      </p>

      {error ? (
        <p className="mt-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Leads aren&apos;t set up yet — the database migration for this
          feature hasn&apos;t been run.
        </p>
      ) : !pageEnabled ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Your public page is off. Turn it on in{" "}
          <Link
            href="/settings"
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            Settings
          </Link>{" "}
          to start collecting leads.
        </p>
      ) : leads.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-600">No leads yet.</p>
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
                    {lead.status === "converted" && (
                      <span className="ml-2 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                        In customers
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {[lead.email, lead.phone].filter(Boolean).join(" · ") ||
                      "No contact info"}{" "}
                    · {new Date(lead.created_at).toLocaleString()}
                  </p>
                  {lead.message && (
                    <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      {lead.message}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {lead.status === "new" && (
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
    </div>
  );
}
