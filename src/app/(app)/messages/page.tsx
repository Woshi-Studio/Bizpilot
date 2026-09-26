import AiCreditMeter from "@/components/ai-credit-meter";
import { requireUserAndBusiness } from "@/lib/data";
import { aiConfigured } from "@/lib/ai";
import { emailStatus } from "@/lib/email";
import MessageGenerator from "./message-generator";

export const metadata = { title: "AI Messages" };

const isContact = (v?: string) =>
  v && /^(customer|lead):[0-9a-f-]{36}$/i.test(v) ? v : undefined;

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; contact?: string; details?: string }>;
}) {
  const params = await searchParams;
  const { supabase, business } = await requireUserAndBusiness();

  const [{ data: customers }, leadsResult] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, company, email")
      .eq("business_id", business.id)
      .order("name"),
    supabase
      .from("leads")
      .select("id, name, email")
      .eq("business_id", business.id)
      .not("status", "in", "(converted,declined)")
      .order("name"),
  ]);

  const contacts = [
    ...((customers ?? []) as { id: string; name: string; company: string | null; email: string | null }[]).map(
      (c) => ({ kind: "customer" as const, ...c })
    ),
    ...((leadsResult.data ?? []) as { id: string; name: string; email: string | null }[]).map((l) => ({
      kind: "lead" as const,
      company: null,
      ...l,
    })),
  ];

  const prefill =
    isContact(params.contact) ??
    (params.customer && /^[0-9a-f-]{36}$/i.test(params.customer) ? `customer:${params.customer}` : undefined);

  const send = emailStatus(business);
  const sendNote = send.canSend
    ? ""
    : send.reason === "coming_soon"
      ? "Sending straight from Jephelen is coming soon. For now, press Copy and paste it into your email."
      : "Email sending isn't set up yet (EMAIL_PROVIDER). Copy works in the meantime.";

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="page-title">AI Messages</h1>
      <p className="page-sub">
        Follow-ups, payment reminders, quotes — written for you, ready to send.
      </p>

      {!aiConfigured() && (
        <p className="alert-warn mt-4">
          AI is taking a short break. Please try again in a few minutes.
        </p>
      )}

      {!send.canSend && (
        <p className="alert-info mt-4 flex items-center gap-2">
          <span aria-hidden>✉️</span>
          {sendNote}
        </p>
      )}

      <AiCreditMeter className="mt-2" />

      <div className="mt-6">
        <MessageGenerator
          contacts={contacts}
          prefillContact={prefill}
          prefillDetails={params.details}
          canSend={send.canSend}
          sendNote={sendNote}
        />
      </div>
    </div>
  );
}
