import Link from "next/link";
import { PlanFaq, PlanTable } from "@/components/plan-explainer";
import { SHOW_PUBLIC_PRICES } from "@/lib/plans";

export const metadata = {
  title: "Plans",
  description: "Starter is free. Hustle and Boss add more room, sending and the full Lead Finder.",
};

// The public plans page (no login). Prices show only when
// SHOW_PUBLIC_PRICES is on; the app's /plans page always shows them.
export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex items-center justify-between px-4 py-4 sm:px-10">
        <Link href="/" className="text-xl font-bold text-indigo-600">
          Jephelen
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">
            Log in
          </Link>
          <Link href="/signup" className="btn-primary">
            Start free
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 sm:px-6">
        <section className="pt-8 text-center sm:pt-14">
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">Plans</h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-ink-2">
            Start free with Starter. Move up when you need more room, email sending, or the full
            Lead Finder. Paid plans renew every 4 weeks; cancel any time.
          </p>
          <Link href="/signup" className="btn-primary mt-6">
            Start free — no card needed
          </Link>
        </section>

        <section className="mt-10">
          <PlanTable showPrices={SHOW_PUBLIC_PRICES} />
        </section>

        <section className="mt-10">
          <PlanFaq inApp={false} />
        </section>

        <p className="mt-10 text-center text-xs text-muted">
          <Link href="/terms" className="hover:underline">Terms</Link> ·{" "}
          <Link href="/privacy" className="hover:underline">Privacy</Link> ·{" "}
          <Link href="/acceptable-use" className="hover:underline">Acceptable Use</Link>
        </p>
      </main>
    </div>
  );
}
