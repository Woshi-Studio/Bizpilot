import { NextResponse, type NextRequest } from "next/server";
import { requireUserAndBusiness } from "@/lib/data";

// Download: checks the document belongs to the signed-in owner, then
// sends the browser to a signed URL that expires after 60 seconds.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await params;
  const { supabase, business } = await requireUserAndBusiness();

  const { data: doc } = await supabase
    .from("documents")
    .select("path, name")
    .eq("id", docId)
    .eq("customer_id", id)
    .eq("business_id", business.id)
    .maybeSingle();

  if (!doc) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from("client-docs")
    .createSignedUrl(doc.path, 60, { download: doc.name });

  if (error || !data?.signedUrl) {
    return new NextResponse("Could not create a download link", { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}
