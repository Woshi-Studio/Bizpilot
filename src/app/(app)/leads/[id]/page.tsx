import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserAndBusiness } from "@/lib/data";
import { LEAD_CHANNELS, LEAD_STATUSES, type Lead } from "@/lib/types";
import type { Activity } from "@/lib/activities";
import { loadBusinessLines } from "@/lib/activities";
import { emailNote, emailStatus } from "@/lib/email";
import Timeline from "@/components/timeline";
import LocalTime from "@/components/local-time";
import Icon from "@/components/icons";
import ContactHeader, { FactCard, Section } from "@/components/contact/contact-header";
import ContactActions from "@/components/contact/contact-actions";
import LeadForm from "../lead-form";
import LeadStatusSelect from "../lead-status-select";
import { convertLead } from "../actions";

export const metadata = { title: "Lead" };

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, business } = await requireUserAndBusiness();

  const { data } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();

  if (!data) {
    notFound();
  }
  const lead = data as Lead;
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  const [activitiesResult, lines, customerResult] = await Promise.all([
    supabase
      .from("activities")
      .select("*")
      .eq("business_id", business.id)
      .eq("lead_id", id)
      .order("occurred_at", { ascending: false })
      .limit(500),
    loadBusinessLines(supabase, business.id),
    lead.email
      ? supabase
          .from("customers")
          .select("id, name")
          .eq("business_id", business.id)
          .ilike("email", lead.email.replace(/[\\%_]/g, (m) => "\\" + m))
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const status = LEAD_STATUSES.find((s) => s.value === lead.status) ?? null;
  const channel = LEAD_CHANNELS.find((c) => c.value === lead.channel);
  const customer = customerResult.data as { id: string; name: string } | null;
  const activities = (activitiesResult.data ?? []) as Activity[];
  const nextMeeting = activities
    .filter((a) => a.kind === "meeting" && a.occurred_at > nowIso)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))[0];
  const touches = activities.filter((a) =>
    ["email_sent", "email_reply", "call", "meeting"].includes(a.kind)
  ).length;
  const send = emailStatus(business);

  const convert = customer ? (
    <Link href={`/customers/${customer.id}`} className="btn-secondary btn-sm shrink-0">
      <Icon name="people" className="h-4 w-4" />
      Customer: {customer.name}
    </Link>
  ) : lead.status !== "converted" ? (
    <form action={convertLead} className="shrink-0">
      <input type="hidden" name="id" value={lead.id} />
      <button type="submit" className="btn-secondary btn-sm">
        <Icon name="plus" className="h-4 w-4" />
        Add to customers
      </button>
    </form>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <ContactHeader
        backHref="/leads"
        backLabel="Leads"
        name={lead.name}
        company={lead.company}
        status={status}
        line={lead.business_line}
        phone={lead.phone}
        email={lead.email}
        address={lead.address}
        website={lead.website}
        badges={
          <span className="inline-flex items-center rounded-full bg-surface-3 px-2.5 py-0.5 text-xs font-medium text-ink-2">
            {channel?.label ?? lead.channel} · added&nbsp;
            <LocalTime iso={lead.created_at} mode="date" />
          </span>
        }
        aside={
          <div className="rounded-2xl bg-surface-2 p-3.5 sm:w-60">
            <p className="eyebrow">Status</p>
            <div className="mt-2">
              <LeadStatusSelect id={lead.id} status={lead.status} />
            </div>
          </div>
        }
      />

      <ContactActions
        kind="lead"
        id={lead.id}
        name={lead.name}
        email={lead.email}
        canSend={send.canSend}
        sendNote={send.canSend ? undefined : emailNote(send)}
        businessName={business.name}
        leadConvert={convert}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FactCard
          icon="calendar"
          label="Follow up"
          value={lead.follow_up_date ?? "Not set"}
          hint={
            lead.follow_up_date && lead.follow_up_date < today
              ? "Overdue — reach out today"
              : lead.follow_up_date
                ? "Planned"
                : "Set a date below"
          }
          tone={lead.follow_up_date && lead.follow_up_date <= today ? "warn" : "default"}
        />
        <FactCard
          icon="chat"
          label="Touches"
          value={String(touches)}
          hint="Emails, replies, calls and meetings"
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

      {lead.message && (
        <Section title="What they said">
          <p className="whitespace-pre-line text-sm leading-6 text-ink-2">{lead.message}</p>
        </Section>
      )}

      <Section title="Timeline">
        <Timeline
          activities={activities}
          leadId={lead.id}
          missing={!!activitiesResult.error}
          nowIso={nowIso}
        />
      </Section>

      <details className="card group p-5 sm:p-7">
        <summary className="flex cursor-pointer list-none items-center justify-between">
          <span className="section-title">Edit details</span>
          <span className="text-sm text-muted group-open:hidden">Name, contact info, channel, follow-up</span>
        </summary>
        <div className="mt-5">
          <LeadForm lead={lead} lines={lines} />
        </div>
      </details>
    </div>
  );
}
