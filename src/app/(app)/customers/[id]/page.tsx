import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserAndBusiness } from "@/lib/data";
import { formatMoney, type Customer, type CustomerNote } from "@/lib/types";
import CustomerForm from "../customer-form";
import { updateCustomer, setFollowUpIn } from "../actions";
import NotesSection from "./notes-section";
import DeleteCustomerButton from "./delete-button";
import WeeklyReport from "./weekly-report";
import DocumentsSection, { type CustomerDocument } from "./documents-section";
import Timeline from "@/components/timeline";
import type { Activity } from "@/lib/activities";
import { lineLabel } from "@/lib/business-lines";

export const metadata = { title: "Customer" };

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, business } = await requireUserAndBusiness();

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();

  if (!customer) {
    notFound();
  }

  const [
    { data: notes },
    { data: customerTxs },
    { data: doneTasks },
    activitiesResult,
    documentsResult,
  ] = await Promise.all([
      supabase
        .from("customer_notes")
        .select("*")
        .eq("customer_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("transactions")
        .select("type, amount")
        .eq("customer_id", id),
      supabase
        .from("tasks")
        .select("title, description, completed_at")
        .eq("customer_id", id)
        .eq("status", "done")
        .order("completed_at", { ascending: false }),
      supabase
        .from("activities")
        .select("*")
        .eq("business_id", business.id)
        .eq("customer_id", id)
        .order("occurred_at", { ascending: false })
        .limit(500),
      supabase
        .from("documents")
        .select("id, name, size, mime, uploaded_at")
        .eq("business_id", business.id)
        .eq("customer_id", id)
        .order("uploaded_at", { ascending: false }),
    ]);

  const revenue = (customerTxs ?? [])
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <Link
          href="/customers"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          &larr; Back to customers
        </Link>
        <DeleteCustomerButton
          customerId={customer.id}
          customerName={customer.name}
        />
      </div>

      <h1 className="mt-2 text-2xl font-bold text-slate-900">
        {customer.name}
      </h1>
      {(customer.company || customer.business_line) && (
        <p className="mt-0.5 text-sm text-slate-500">
          {customer.company}
          {customer.company && customer.business_line && " · "}
          {customer.business_line && (
            <span className="font-medium text-indigo-600">
              {lineLabel(customer.business_line)}
            </span>
          )}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {revenue > 0 && (
          <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 font-medium text-green-700">
            {formatMoney(revenue, business.currency)} earned from this customer
          </span>
        )}
        <span className="text-slate-500">
          Follow-up:{" "}
          <span className="font-medium text-slate-700">
            {customer.next_follow_up ?? "not set"}
          </span>
        </span>
        <form action={setFollowUpIn} className="inline-flex gap-1.5">
          <input type="hidden" name="id" value={customer.id} />
          <button
            type="submit"
            name="days"
            value="7"
            className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-600"
          >
            +1 week
          </button>
          <button
            type="submit"
            name="days"
            value="30"
            className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-600"
          >
            +1 month
          </button>
        </form>
        <Link
          href={`/messages?customer=${customer.id}`}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          ✨ Write them a message
        </Link>
        <Link
          href={`/messages?customer=${customer.id}&details=${encodeURIComponent(
            "Write a warm, short message asking this customer if they know anyone else who could use my services — a friendly referral ask, not pushy. Mention I'd love to return the favor."
          )}`}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          🙌 Ask for a referral
        </Link>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Details</h2>
        <CustomerForm
          action={updateCustomer}
          customer={customer as Customer}
          submitLabel="Save changes"
        />
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Timeline</h2>
        <Timeline
          activities={(activitiesResult.data ?? []) as Activity[]}
          customerId={customer.id}
          missing={!!activitiesResult.error}
          nowIso={new Date().toISOString()}
        />
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Documents</h2>
        <DocumentsSection
          customerId={customer.id}
          documents={(documentsResult.data ?? []) as CustomerDocument[]}
          missing={!!documentsResult.error}
        />
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Notes</h2>
        <NotesSection
          customerId={customer.id}
          notes={(notes ?? []) as CustomerNote[]}
        />
      </div>

      <div className="mt-6">
        <WeeklyReport
          customerName={customer.name}
          businessName={business.name}
          notes={(notes ?? []) as CustomerNote[]}
          doneTasks={doneTasks ?? []}
        />
      </div>
    </div>
  );
}
