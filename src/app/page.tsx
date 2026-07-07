import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const FEATURES = [
  {
    emoji: "👥",
    title: "Never forget a customer",
    text: "Profiles, notes, and follow-up reminders — everyone you work with, in one place.",
  },
  {
    emoji: "🛡️",
    title: "Decision Guard",
    text: "Before you give that discount or take that deal, a 60-second gut check catches expensive mistakes.",
  },
  {
    emoji: "✨",
    title: "AI writes your messages",
    text: "Follow-ups, payment reminders, quotes — professional, personal, ready to send.",
  },
  {
    emoji: "💰",
    title: "Money without the spreadsheet",
    text: "Income, expenses, receipts, monthly profit — plus one-click tax export.",
  },
  {
    emoji: "🧾",
    title: "Quotes & invoices",
    text: "Create, print, mark paid — and the income logs itself, linked to the customer.",
  },
  {
    emoji: "📋",
    title: "A plan for every day",
    text: "Your tasks, follow-ups, and an AI daily plan telling you what to tackle first.",
  },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <span className="text-xl font-bold text-indigo-600">Jephelen</span>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Get started free
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 pb-16 pt-16 text-center sm:pt-24">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Your AI copilot for running a{" "}
            <span className="text-indigo-600">smarter business</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-slate-600">
            Customers, tasks, money, invoices, and an AI that writes your
            messages and stops your bad decisions — all in one simple hub built
            for freelancers and small businesses.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/signup"
              className="rounded-md bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              Start free — no card needed
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-24">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <span className="text-2xl">{f.emoji}</span>
                <h2 className="mt-3 text-sm font-semibold text-slate-800">
                  {f.title}
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-slate-500">
                  {f.text}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 px-6 py-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} Jephelen</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-slate-600">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-slate-600">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
