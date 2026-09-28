import { requireUserAndBusiness } from "@/lib/data";
import PublicPageForm from "./public-page-form";

export const metadata = { title: "Public page" };

// People -> Public page: your page with a contact form; new requests land
// in Leads. Moved here from Settings (old link /settings/public-page redirects).
export default async function PublicPageSettings() {
  const { business } = await requireUserAndBusiness();
  const b = business as typeof business & {
    slug?: string | null;
    public_page_enabled?: boolean | null;
    tagline?: string | null;
    services?: string | null;
  };
  return (
    <div className="mx-auto max-w-6xl [&>*]:max-w-4xl">
      <h1 className="page-title">Public page</h1>
      <p className="page-sub">A simple page about your business with a contact form. New requests show up in Leads.</p>
      <div className="mt-6">
        {"slug" in b ? (
          <PublicPageForm
            defaults={{
              enabled: b.public_page_enabled ?? false,
              slug: b.slug ?? "",
              tagline: b.tagline ?? "",
              services: b.services ?? "",
            }}
          />
        ) : (
          <p className="alert-warn">The public page isn&apos;t switched on yet. Please check back soon.</p>
        )}
      </div>
    </div>
  );
}
