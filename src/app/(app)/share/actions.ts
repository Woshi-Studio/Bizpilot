"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";
import { logActivity } from "@/lib/activities";
import { isOwnerBusiness } from "@/lib/ai-quota";
import { isDemoMode } from "@/lib/demo";
import {
  EmailError,
  MAX_ATTACHMENT_BYTES,
  MAX_BODY,
  cleanSubject,
  consumeEmailSend,
  deliverEmail,
  emailNote,
  emailStatus,
  isValidEmail,
} from "@/lib/email";
import { invoiceHtml, type InvoiceDoc } from "@/lib/invoice-doc";
import type { Business } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ShareKind = "invoice" | "document";
export type SendDocState = { error?: string; success?: string; sentAt?: number };

const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

async function baseUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function linkPath(kind: ShareKind, token: string) {
  return kind === "invoice" ? `/i/${token}` : `/d/${token}`;
}

// The live view link for an invoice or a document (made once, reused).
// Anyone with the link can view that one document, nothing else.
async function ensureLink(
  supabase: SupabaseClient,
  business: Business,
  kind: ShareKind,
  id: string
): Promise<{ url: string } | { error: string }> {
  if (!isId(id)) return { error: "Missing document." };
  const column = kind === "invoice" ? "invoice_id" : "document_id";
  const table = kind === "invoice" ? "invoices" : "documents";

  const { data: owned } = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!owned) return { error: "That document wasn't found." };

  if (isDemoMode()) return { url: `${await baseUrl()}${linkPath(kind, "demo-link-" + "x".repeat(40))}` };

  const { data: existing, error: readError } = await supabase
    .from("share_links")
    .select("token")
    .eq("business_id", business.id)
    .eq(column, id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) {
    return {
      error: isOwnerBusiness(business.id)
        ? "View links need a quick database update first (migration 0017)."
        : "View links aren't ready yet. Please try again later.",
    };
  }
  if (existing) return { url: `${await baseUrl()}${linkPath(kind, existing.token as string)}` };

  const token = randomBytes(32).toString("base64url");
  const { error } = await supabase
    .from("share_links")
    .insert({ token, business_id: business.id, [column]: id });
  if (error) return { error: "Couldn't make a view link. Please try again." };
  return { url: `${await baseUrl()}${linkPath(kind, token)}` };
}

export async function getShareLink(kind: ShareKind, id: string) {
  if (kind !== "invoice" && kind !== "document") return { error: "Unknown kind." };
  const { supabase, business } = await requireUserAndBusiness();
  return ensureLink(supabase, business, kind, String(id));
}

// Turns off every view link for this invoice / document. A new one is
// made the next time it's shared.
export async function revokeShareLinks(formData: FormData) {
  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  if ((kind !== "invoice" && kind !== "document") || !isId(id)) return;
  const { supabase, business } = await requireUserAndBusiness();
  await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("business_id", business.id)
    .eq(kind === "invoice" ? "invoice_id" : "document_id", id)
    .is("revoked_at", null);
  revalidatePath(kind === "invoice" ? `/invoices/${id}` : "/customers");
}

// The owner's view of an invoice, as a document to render / attach.
async function loadInvoiceDoc(supabase: SupabaseClient, business: Business, id: string) {
  const { data } = await supabase
    .from("invoices")
    .select("*, customers(id, name, company, email, business_line), invoice_items(*)")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!data) return null;
  const inv = data as {
    id: string;
    number: string;
    doc_type: "invoice" | "quote";
    status: string;
    issue_date: string;
    due_date: string | null;
    notes: string | null;
    currency?: string | null;
    tax_label?: string | null;
    tax_rate?: number | null;
    business_line?: string | null;
    customers: { id: string; name: string; company: string | null; email: string | null; business_line: string | null } | null;
    invoice_items: { description: string; quantity: number; unit_price: number; position: number }[];
  };
  const doc: InvoiceDoc = {
    number: inv.number,
    doc_type: inv.doc_type,
    status: inv.status,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    notes: inv.notes,
    currency: inv.currency || business.currency,
    tax_label: inv.tax_label ?? null,
    tax_rate: Number(inv.tax_rate ?? 0),
    business_name: business.name,
    owner_name: null,
    customer_name: inv.customers?.name ?? null,
    customer_company: inv.customers?.company ?? null,
    items: [...inv.invoice_items]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ description: i.description, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
  };
  return { inv, doc };
}

function readMessage(formData: FormData) {
  const subject = cleanSubject(String(formData.get("subject") ?? ""));
  const body = String(formData.get("body") ?? "").trim();
  if (!subject) return { error: "Add a subject line." };
  if (!body) return { error: "The message is empty." };
  if (body.length > MAX_BODY) return { error: "That message is too long to send." };
  return { subject, body };
}

// Emails an invoice / quote to its customer, with an HTML copy attached
// (opens in any browser, prints to PDF) and the view link in the text.
// Marks it Sent only after the email really went out.
export async function sendInvoiceEmail(_prev: SendDocState, formData: FormData): Promise<SendDocState> {
  const id = String(formData.get("id") ?? "");
  const msg = readMessage(formData);
  if ("error" in msg) return msg;

  const { supabase, user, business } = await requireUserAndBusiness();
  const status = emailStatus(business);
  if (!status.canSend) return { error: emailNote(status) };

  const loaded = isId(id) ? await loadInvoiceDoc(supabase, business, id) : null;
  if (!loaded) return { error: "That invoice wasn't found." };
  const { inv, doc } = loaded;
  const to = inv.customers?.email?.trim();
  if (!inv.customers || !isValidEmail(to)) {
    return { error: "This customer has no valid email. Add one on their page first." };
  }

  const link = await ensureLink(supabase, business, "invoice", id);
  const quota = await consumeEmailSend(supabase, business.id);
  if (!quota.ok) {
    return {
      error: quota.missing
        ? "Email sending isn't ready yet. Use Open in my email for now."
        : `You've sent ${quota.limit} emails today — that's the daily limit. It resets at midnight UTC.`,
    };
  }

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  doc.owner_name = profile?.full_name ?? null;

  try {
    await deliverEmail({
      provider: status.provider,
      to: to!,
      subject: msg.subject,
      text: msg.body,
      fromName: profile?.full_name || business.name,
      replyTo: user.email ?? null,
      attachments: [
        {
          filename: `${doc.number}.html`,
          content: Buffer.from(invoiceHtml(doc, "url" in link ? link.url : null), "utf8"),
          contentType: "text/html",
        },
      ],
    });
  } catch (err) {
    console.error(`[email] invoice send failed for business ${business.id}: ${err instanceof Error ? err.message : err}`);
    return { error: err instanceof EmailError ? err.userMessage : "The email didn't go out. Please try again." };
  }

  if (inv.status === "draft") {
    await supabase.from("invoices").update({ status: "sent" }).eq("id", id).eq("business_id", business.id);
  }
  await logActivity(supabase, {
    business_id: business.id,
    customer_id: inv.customers.id,
    business_line: inv.business_line ?? inv.customers.business_line ?? null,
    kind: "email_sent",
    subject: msg.subject,
    body: msg.body,
    source: "mailer",
  });

  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
  revalidatePath(`/customers/${inv.customers.id}`);
  return { success: `Sent to ${inv.customers.name} (${to}).`, sentAt: Date.now() };
}

// Emails a file from a customer's Documents, attached (max 10 MB).
export async function sendDocumentEmail(_prev: SendDocState, formData: FormData): Promise<SendDocState> {
  const id = String(formData.get("id") ?? "");
  const msg = readMessage(formData);
  if ("error" in msg) return msg;

  const { supabase, user, business } = await requireUserAndBusiness();
  const status = emailStatus(business);
  if (!status.canSend) return { error: emailNote(status) };

  const { data: d } = isId(id)
    ? await supabase
        .from("documents")
        .select("id, name, path, mime, size, customer_id, customers(id, name, email, business_line)")
        .eq("id", id)
        .eq("business_id", business.id)
        .maybeSingle()
    : { data: null };
  if (!d) return { error: "That file wasn't found." };
  const doc = d as unknown as {
    id: string;
    name: string;
    path: string;
    mime: string;
    size: number;
    customers: { id: string; name: string; email: string | null; business_line: string | null } | null;
  };
  const to = doc.customers?.email?.trim();
  if (!doc.customers || !isValidEmail(to)) {
    return { error: "This customer has no valid email. Add one on their page first." };
  }
  if (Number(doc.size) > MAX_ATTACHMENT_BYTES) {
    return { error: "That file is over 10 MB. Send the link instead (Open in my email)." };
  }

  let content: Buffer;
  if (isDemoMode()) {
    content = Buffer.from("demo file");
  } else {
    const { data: blob, error } = await supabase.storage.from("client-docs").download(doc.path);
    if (error || !blob) return { error: "Couldn't read the file. Please try again." };
    content = Buffer.from(await blob.arrayBuffer());
  }

  const quota = await consumeEmailSend(supabase, business.id);
  if (!quota.ok) {
    return {
      error: quota.missing
        ? "Email sending isn't ready yet. Use Open in my email for now."
        : `You've sent ${quota.limit} emails today — that's the daily limit. It resets at midnight UTC.`,
    };
  }

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  try {
    await deliverEmail({
      provider: status.provider,
      to: to!,
      subject: msg.subject,
      text: msg.body,
      fromName: profile?.full_name || business.name,
      replyTo: user.email ?? null,
      attachments: [{ filename: doc.name, content, contentType: doc.mime }],
    });
  } catch (err) {
    console.error(`[email] document send failed for business ${business.id}: ${err instanceof Error ? err.message : err}`);
    return { error: err instanceof EmailError ? err.userMessage : "The email didn't go out. Please try again." };
  }

  await logActivity(supabase, {
    business_id: business.id,
    customer_id: doc.customers.id,
    business_line: doc.customers.business_line ?? null,
    kind: "email_sent",
    subject: msg.subject,
    body: `${msg.body}\n\n📎 ${doc.name}`,
    source: "mailer",
  });
  revalidatePath(`/customers/${doc.customers.id}`);
  return { success: `Sent to ${doc.customers.name} (${to}).`, sentAt: Date.now() };
}
