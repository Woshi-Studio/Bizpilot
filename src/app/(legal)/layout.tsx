import Link from "next/link";

const LEGAL_LINKS = [
  ["/terms", "Terms"],
  ["/privacy", "Privacy"],
  ["/acceptable-use", "Acceptable Use"],
  ["/data-sources", "Data sources"],
  ["/remove-my-data", "Remove my business data"],
] as const;

export default function LegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-12">
      <Link href="/" className="text-sm font-bold text-indigo-600">
        Jephelen
      </Link>
      <div className="prose-sm mt-6 text-slate-700 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-slate-900 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-800 [&_p]:mt-2 [&_p]:leading-6 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_li]:leading-6 [&_article_a]:text-indigo-600 [&_article_a]:underline [&_article_a]:underline-offset-2">
        {children}
      </div>
      <nav aria-label="Legal pages" className="mt-10 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-200 pt-4 text-xs">
        {LEGAL_LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="text-slate-500 hover:text-indigo-600 hover:underline">
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
