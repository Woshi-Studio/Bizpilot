import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BUSINESS_TYPES } from "@/lib/types";
import LeadForm from "./lead-form";

export default async function PublicBusinessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .rpc("get_public_business", { page_slug: slug })
    .maybeSingle();

  if (!data) {
    notFound();
  }

  const business = data as {
    id: string;
    name: string;
    tagline: string | null;
    services: string | null;
    business_type: string;
  };

  const typeLabel =
    BUSINESS_TYPES.find((t) => t.value === business.business_type)?.label ??
    "Freelance services";
  const services = (business.services ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <main className="mx-auto w-full max-w-xl flex-1 px-6 py-14">
        <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">
          {typeLabel}
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">
          {business.name}
        </h1>
        {business.tagline && (
          <p className="mt-2 text-base leading-7 text-slate-600">
            {business.tagline}
          </p>
        )}

        {services.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-slate-800">Services</h2>
            <ul className="mt-3 space-y-2">
              {services.map((s) => (
                <li
                  key={s}
                  className="flex items-start gap-2 text-sm text-slate-700"
                >
                  <span className="mt-0.5 text-indigo-500">✓</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-10 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">
            Get in touch
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Send a message and {business.name} will get back to you.
          </p>
          <div className="mt-4">
            <LeadForm businessId={business.id} />
          </div>
        </div>
      </main>

      <footer className="px-6 py-6 text-center text-xs text-slate-400">
        Powered by{" "}
        <Link href="/" className="font-medium text-indigo-500 hover:text-indigo-600">
          Jephelen
        </Link>
      </footer>
    </div>
  );
}
