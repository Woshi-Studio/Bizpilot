import Link from "next/link";
import { requireUserAndBusiness } from "@/lib/data";
import { listTemplates } from "@/app/(app)/templates/actions";
import TemplatesSection from "./templates-section";

export const metadata = { title: "Templates" };

// AI -> Templates: the quick email templates used in Send email and
// Messages. Moved here from Settings (old link /settings/templates redirects).
export default async function TemplatesPage() {
  await requireUserAndBusiness();
  const saved = await listTemplates();
  return (
    <div className="mx-auto max-w-6xl [&>*]:max-w-4xl">
      <h1 className="page-title">Templates</h1>
      <p className="page-sub">
        Ready-made emails in English and French. They show up in every Send email box.{" "}
        <Link href="/messages" className="link">Write a message</Link>
      </p>
      <div className="mt-6">
        <TemplatesSection saved={saved} />
      </div>
    </div>
  );
}
