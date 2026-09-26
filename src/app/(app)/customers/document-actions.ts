"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";
import { logActivity } from "@/lib/activities";
import { checkPlanLimit, planLimitFromError } from "@/lib/plan-limits";

const MAX_DOC_BYTES = 10 * 1024 * 1024;
const BUCKET = "client-docs";

// Allowed extensions -> the MIME type we store, plus the first bytes a
// real file of that type starts with.
const DOC_TYPES: Record<string, { mime: string; magic: number[][] }> = {
  pdf: { mime: "application/pdf", magic: [[0x25, 0x50, 0x44, 0x46]] },
  jpg: { mime: "image/jpeg", magic: [[0xff, 0xd8, 0xff]] },
  jpeg: { mime: "image/jpeg", magic: [[0xff, 0xd8, 0xff]] },
  png: { mime: "image/png", magic: [[0x89, 0x50, 0x4e, 0x47]] },
  webp: { mime: "image/webp", magic: [[0x52, 0x49, 0x46, 0x46]] },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    magic: [[0x50, 0x4b, 0x03, 0x04]],
  },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    magic: [[0x50, 0x4b, 0x03, 0x04]],
  },
};

// Browsers sometimes send an empty or generic type for Office files.
const GENERIC_TYPES = ["", "application/octet-stream", "application/zip"];

export type DocumentFormState = {
  error?: string;
  success?: string;
  upgrade?: boolean;
};

function safeFileName(name: string) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .slice(-120);
  return cleaned || "file";
}

export async function uploadDocument(
  _prevState: DocumentFormState,
  formData: FormData
): Promise<DocumentFormState> {
  const customerId = String(formData.get("customer_id") ?? "").trim();
  const file = formData.get("file");

  if (!customerId) return { error: "Missing customer." };
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  if (file.size > MAX_DOC_BYTES) {
    return { error: "File is too large (max 10 MB)." };
  }

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const type = DOC_TYPES[ext];
  if (!type) {
    return { error: "Files must be PDF, JPG, PNG, WEBP, DOCX or XLSX." };
  }
  if (file.type !== type.mime && !GENERIC_TYPES.includes(file.type)) {
    return { error: "The file type doesn't match its name." };
  }

  // Check the file really is what its name says.
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const magicOk = type.magic.some((sig) => sig.every((b, i) => head[i] === b));
  const webpOk =
    ext !== "webp" ||
    String.fromCharCode(...Array.from(head.slice(8, 12))) === "WEBP";
  if (!magicOk || !webpOk) {
    return { error: "That file looks damaged or isn't really a " + ext.toUpperCase() + "." };
  }

  const { supabase, business } = await requireUserAndBusiness();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, business_line")
    .eq("id", customerId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!customer) return { error: "Customer not found." };

  const limited = await checkPlanLimit(supabase, business, "storage", { bytes: file.size });
  if (limited) return limited;

  const displayName = file.name.slice(0, 255);
  const path = `${business.id}/${customer.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: type.mime, upsert: false });
  if (uploadError) {
    return { error: `Upload failed: ${uploadError.message}` };
  }

  const { error } = await supabase.from("documents").insert({
    business_id: business.id,
    customer_id: customer.id,
    name: displayName,
    path,
    size: file.size,
    mime: type.mime,
  });
  if (error) {
    // Don't leave an orphan file behind
    await supabase.storage.from(BUCKET).remove([path]);
    return planLimitFromError(error, business) ?? { error: error.message };
  }

  await logActivity(supabase, {
    business_id: business.id,
    customer_id: customer.id,
    business_line:
      (customer as { business_line?: string | null }).business_line ?? null,
    kind: "file",
    subject: `Uploaded ${displayName}`,
  });

  revalidatePath(`/customers/${customer.id}`);
  return { success: "File uploaded." };
}

export async function deleteDocument(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, business } = await requireUserAndBusiness();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, path, customer_id")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!doc) return;

  await supabase.storage.from(BUCKET).remove([doc.path]);
  await supabase
    .from("documents")
    .delete()
    .eq("id", doc.id)
    .eq("business_id", business.id);

  revalidatePath(`/customers/${doc.customer_id}`);
}

// Renames a file (the stored file keeps its path).
export async function renameDocument(
  _prev: DocumentFormState,
  formData: FormData
): Promise<DocumentFormState> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 255);
  if (!id) return { error: "Missing file." };
  if (!name) return { error: "Give the file a name." };

  const { supabase, business } = await requireUserAndBusiness();
  const { data, error } = await supabase
    .from("documents")
    .update({ name })
    .eq("id", id)
    .eq("business_id", business.id)
    .select("customer_id")
    .maybeSingle();
  if (error || !data) return { error: "Couldn't rename the file." };
  revalidatePath(`/customers/${data.customer_id}`);
  return { success: "Renamed." };
}
