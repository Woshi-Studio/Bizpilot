import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// A shared file: checks the token (shared_document, 0017), then sends the
// visitor to a 60-second download link. No login; the token is the key.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const notFound = () => new Response("This link doesn't work any more.", { status: 404 });
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("shared_document", { p_token: token });
  const doc = data as { path?: string; name?: string } | null;
  if (error || !doc?.path) return notFound();

  const admin = createAdminClient();
  if (!admin) return new Response("File sharing isn't set up yet.", { status: 503 });
  const { data: signed } = await admin.storage
    .from("client-docs")
    .createSignedUrl(doc.path, 60, { download: doc.name ?? true });
  if (!signed?.signedUrl) return notFound();

  return new Response(null, {
    status: 302,
    headers: { Location: signed.signedUrl, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
