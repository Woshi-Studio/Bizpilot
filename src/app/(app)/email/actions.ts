"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";
import { logActivity } from "@/lib/activities";
import {
  EmailError,
  MAX_BODY,
  cleanSubject,
  consumeEmailSend,
  deliverEmail,
  emailNote,
  emailStatus,
  loadRecipient,
} from "@/lib/email";
import { isOwnerBusiness } from "@/lib/ai-quota";

export type SendEmailState = {
  error?: string;
  success?: string;
  sentAt?: number;
};

// Sends one email to one of the business's own customers or leads.
// Form fields: contact (e.g. "customer:<uuid>" or "lead:<uuid>"),
// subject, body.
export async function sendEmail(
  _prev: SendEmailState,
  formData: FormData
): Promise<SendEmailState> {
  const contact = String(formData.get("contact") ?? "");
  const [kind, id] = contact.split(":");
  const subject = cleanSubject(String(formData.get("subject") ?? ""));
  const body = String(formData.get("body") ?? "").trim();

  if (!subject) return { error: "Add a subject line." };
  if (!body) return { error: "The message is empty." };
  if (body.length > MAX_BODY) return { error: "That message is too long to send." };

  const { supabase, user, business } = await requireUserAndBusiness();

  const status = emailStatus(business);
  if (!status.canSend) {
    return { error: emailNote(status) };
  }

  const recipient = await loadRecipient(supabase, business.id, kind ?? "", id ?? "");
  if ("error" in recipient) return { error: recipient.error };

  const quota = await consumeEmailSend(supabase, business.id);
  if (!quota.ok) {
    return {
      error: quota.missing
        ? isOwnerBusiness(business.id)
          ? "Email sending needs a quick database update (migration 0015)."
          : "Email sending isn't ready yet. Copy works in the meantime."
        : `You've sent ${quota.limit} emails today — that's the daily limit. It resets at midnight UTC.`,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  try {
    await deliverEmail({
      provider: status.provider,
      to: recipient.email,
      subject,
      text: body,
      fromName: profile?.full_name || business.name,
      replyTo: user.email ?? null,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[email] send failed for business ${business.id}: ${detail}`);
    return {
      error: err instanceof EmailError ? err.userMessage : "The email didn't go out. Please try again.",
    };
  }

  await logActivity(supabase, {
    business_id: business.id,
    kind: "email_sent",
    subject,
    body,
    customer_id: recipient.kind === "customer" ? recipient.id : null,
    lead_id: recipient.kind === "lead" ? recipient.id : null,
    business_line: recipient.business_line,
    source: "mailer",
  });

  revalidatePath(recipient.kind === "customer" ? `/customers/${recipient.id}` : `/leads/${recipient.id}`);
  revalidatePath("/dashboard");
  return { success: `Sent to ${recipient.name} (${recipient.email}).`, sentAt: Date.now() };
}
