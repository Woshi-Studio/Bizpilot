import Link from "next/link";

export default function LegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/" className="text-sm font-bold text-indigo-600">
        Jephelen
      </Link>
      <div className="prose-sm mt-6 text-slate-700 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-slate-900 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-800 [&_p]:mt-2 [&_p]:leading-6">
        {children}
      </div>
    </div>
  );
}
