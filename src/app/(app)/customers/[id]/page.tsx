import { notFound } from "next/navigation";
import OpenOnHash from "@/components/open-on-hash";
import { requireUserAndBusiness } from "@/lib/data";
import {
  CUSTOMER_STATUSES,
  formatMoney,
  type Customer,
  type CustomerNote,
} from "@/lib/types";
import CustomerForm from "../customer-form";
import { updateCustomer, setFollowUpIn } from "../actions";
import NotesSection from "./notes-section";
import DeleteCustomerButton from "./delete-button";
import WeeklyReport from "./weekly-report";
import DocumentsSection, { type CustomerDocument } from "./documents-section";
import Timeline from "@/components/timeline";
import LocalTime from "@/components/local-time";
import Icon from "@/components/icons";
import type { Activity } from "@/lib/activities";
import { loadBusinessLines } from "@/lib/activities";
import { emailNote, emailStatus } from "@/lib/email";
import ContactHeader, { FactCard, Section } from "@/components/contact/contact-header";
import ContactActions, { type OpenInvoice, type SendableDoc } from "@/components/contact/contact-actions";
import { invoiceTotals } from "@/lib/line-settings";
import { invoiceEmailText, type InvoiceDoc } from "@/lib/invoice-doc";

type SendRow = {
  id: string;
  number: string;
  status: string;
  doc_type: "invoice" | "quote";
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  currency?: string | null;
  tax_label?: string | null;
  tax_rate?: number | null;
  invoice_items: { description?: string; quantity: number; unit_price: number; position?: number }[];
};

export const metadata = { title: "Customer" };


export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, business } = await requireUserAndBusiness();

  const { data } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();

  if (!data) {
    notFound();
  }
  const customer = data as Customer;

  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  const [
    { data: notes },
    { data: customerTxs },
    { data: doneTasks },
    { data: openTasksData },
    { data: invoicesData },
    activitiesResult,
    documentsResult,
    lines,
  ] = await Promise.all([
    supabase
      .from("customer_notes")
      .select("*")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("transactions").select("type, amount").eq("customer_id", id),
    supabase
      .from("tasks")
      .select("title, description, completed_at")
      .eq("customer_id", id)
      .eq("status", "done")
      .order("completed_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("id, title, due_date")
      .eq("business_id", business.id)
      .eq("customer_id", id)
      .is("completed_at", null)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("invoices")
      .select("*, invoice_items(description, quantity, unit_price, position)")
      .eq("business_id", business.id)
      .eq("customer_id", id)
      .order("issue_date", { ascending: false }),
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
    loadBusinessLines(supabase, business.id),
  ]);

  const revenue = (customerTxs ?? [])
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const openTasks = (openTasksData ?? []) as { id: string; title: string; due_date: string | null }[];
  const allDocs = (invoicesData ?? []) as SendRow[];
  const invoiceTotal = (inv: SendRow) =>
    invoiceTotals(inv.invoice_items ?? [], inv.tax_rate ?? 0).total;
  const docCurrency = (inv: SendRow) => inv.currency || business.currency;
  const unpaid = allDocs.filter(
    (i) => i.doc_type === "invoice" && (i.status === "sent" || i.status === "draft")
  );
  const unpaidTotal = unpaid.reduce((s, i) => s + invoiceTotal(i), 0);
  const overdue = unpaid.filter((i) => i.status === "sent" && i.due_date && i.due_date < today);
  // "Send invoice" picks the newest draft, else the newest sent one.
  const toSend = unpaid.find((i) => i.status === "draft") ?? unpaid[0] ?? null;
  const openInvoice: OpenInvoice | null = toSend
    ? {
        id: toSend.id,
        number: toSend.number,
        total: formatMoney(invoiceTotal(toSend), docCurrency(toSend)),
        due: toSend.due_date,
      }
    : null;

  // "Send invoice": every invoice / quote not sent yet.
  const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const fromName = me?.full_name || business.name;
  const sendDocs: SendableDoc[] = allDocs
    .filter((d) => d.status === "draft")
    .map((d) => {
      const doc: InvoiceDoc = {
        number: d.number,
        doc_type: d.doc_type,
        status: d.status,
        issue_date: d.issue_date,
        due_date: d.due_date,
        notes: d.notes,
        currency: docCurrency(d),
        tax_label: d.tax_label ?? null,
        tax_rate: Number(d.tax_rate ?? 0),
        business_name: business.name,
        owner_name: me?.full_name ?? null,
        customer_name: customer.name,
        customer_company: customer.company ?? null,
        items: [...(d.invoice_items ?? [])]
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((i) => ({ description: i.description ?? "", quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
      };
      const title = `${d.doc_type === "quote" ? "Quote" : "Invoice"} ${d.number}`;
      return {
        id: d.id,
        title: `${title} · ${formatMoney(invoiceTotal(d), docCurrency(d))}`,
        subject: `${title} from ${business.name}`,
        body: invoiceEmailText(doc, "{link}", fromName),
        status: d.status,
        vars: {
          business: business.name,
          my_name: fromName,
          invoice_number: d.number,
          amount: formatMoney(invoiceTotal(d), docCurrency(d)),
          due_date: d.due_date ?? undefined,
        },
      };
    });

  const activities = (activitiesResult.data ?? []) as Activity[];
  const nextMeeting = activities
    .filter((a) => a.kind === "meeting" && a.occurred_at > nowIso)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))[0];

  const status = CUSTOMER_STATUSES.find((s) => s.value === customer.status) ?? null;
  const send = emailStatus(business);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <ContactHeader
        backHref="/customers"
        backLabel="Customers"
        name={customer.name}
        company={customer.company}
        status={status}
        line={customer.business_line}
        phone={customer.phone}
        email={customer.email}
        address={customer.address}
        website={customer.website}
        badges={
          revenue > 0 ? (
            <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
              {formatMoney(revenue, business.currency)} earned
            </span>
          ) : null
        }
        aside={
          <div className="rounded-2xl bg-surface-2 p-3.5 sm:w-60">
            <p className="eyebrow">Next follow-up</p>
            <p
              className={`mt-1 text-sm font-semibold ${
                customer.next_follow_up && customer.next_follow_up < today
                  ? "text-red-600"
                  : "text-ink"
              }`}
            >
              {customer.next_follow_up ?? "Not set"}
            </p>
            <form action={setFollowUpIn} className="mt-2.5 flex gap-1.5">
              <input type="hidden" name="id" value={customer.id} />
              <button type="submit" name="days" value="7" className="btn-secondary btn-sm flex-1">
                +1 week
              </button>
              <button type="submit" name="days" value="30" className="btn-secondary btn-sm flex-1">
                +1 month
              </button>
            </form>
          </div>
        }
      />

      <ContactActions
        kind="customer"
        id={customer.id}
        name={customer.name}
        email={customer.email}
        canSend={send.canSend}
        sendNote={send.canSend ? undefined : emailNote(send)}
        openInvoice={openInvoice}
        sendDocs={sendDocs}
        businessName={business.name}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FactCard
          icon="check"
          label="Open tasks"
          value={String(openTasks.length)}
          hint={
            openTasks[0]
              ? `Next: ${openTasks[0].title}${openTasks[0].due_date ? ` · ${openTasks[0].due_date}` : ""}`
              : "Nothing open"
          }
          href={`/tasks?customer=${customer.id}`}
        />
        <FactCard
          icon="receipt"
          label="Unpaid invoices"
          value={formatMoney(unpaidTotal, business.currency)}
          hint={
            unpaid.length === 0
              ? "All paid up"
              : `${unpaid.length} open${overdue.length ? ` · ${overdue.length} overdue` : ""}`
          }
          tone={overdue.length ? "warn" : unpaid.length ? "default" : "good"}
          href={openInvoice ? `/invoices/${openInvoice.id}` : "/invoices"}
        />
        <div className="card p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
              <Icon name="calendar" className="h-4 w-4" />
            </span>
            <span className="text-sm font-medium text-muted">Next meeting</span>
          </div>
          {nextMeeting ? (
            <>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-ink">
                <LocalTime iso={nextMeeting.occurred_at} mode="date" />
              </p>
              <p className="mt-0.5 truncate text-sm text-muted">
                {nextMeeting.subject ?? "Meeting"} · <LocalTime iso={nextMeeting.occurred_at} mode="time" />
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-subtle">None</p>
              <p className="mt-0.5 text-sm text-muted">Use “Book meeting” above</p>
            </>
          )}
        </div>
      </div>

      <Section title="Timeline">
        <Timeline
          activities={activities}
          customerId={customer.id}
          missing={!!activitiesResult.error}
          nowIso={nowIso}
        />
      </Section>

      <Section id="documents" title="Documents">
        <DocumentsSection
          customerId={customer.id}
          documents={(documentsResult.data ?? []) as CustomerDocument[]}
          missing={!!documentsResult.error}
          send={{
            to: { name: customer.name, email: customer.email },
            canSend: send.canSend,
            sendNote: send.canSend ? undefined : emailNote(send),
            businessName: business.name,
            fromName,
          }}
        />
      </Section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title="Notes">
          <NotesSection customerId={customer.id} notes={(notes ?? []) as CustomerNote[]} />
        </Section>
        <div>
          <WeeklyReport
            customerName={customer.name}
            businessName={business.name}
            notes={(notes ?? []) as CustomerNote[]}
            doneTasks={doneTasks ?? []}
          />
        </div>
      </div>

      <OpenOnHash id="edit" />
      <details id="edit" className="card group scroll-mt-24 p-5 sm:p-7">
        <summary className="flex cursor-pointer list-none items-center justify-between">
          <span className="section-title">Edit details</span>
          <span className="text-sm text-muted group-open:hidden">Name, contact info, status, business</span>
        </summary>
        <div className="mt-5">
          <CustomerForm
            action={updateCustomer}
            customer={customer}
            submitLabel="Save changes"
            lines={lines}
          />
          <div className="mt-6 flex justify-end border-t border-line/70 pt-5">
            <DeleteCustomerButton customerId={customer.id} customerName={customer.name} />
          </div>
        </div>
      </details>
    </div>
  );
}
