import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Icon, { type IconName } from "@/components/icons";
import Story from "@/components/landing/story";
import Reveal from "@/components/landing/reveal";
import "./landing.css";

// The six features the page always had, plus Lead Finder and the booking
// page (both live in the app, see src/lib/nav.ts).
const FEATURES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "people",
    title: "Never forget a customer",
    text: "Profiles, notes, and follow-up reminders — everyone you work with, in one place.",
  },
  {
    icon: "search",
    title: "Lead Finder",
    text: "Search for local businesses that fit what you sell, with the reason each one fits.",
  },
  {
    icon: "calendar",
    title: "Your own booking page",
    text: "Share one link. People pick a free time, and it lands on your calendar.",
  },
  {
    icon: "mail",
    title: "Messages, ready to send",
    text: "Follow-ups, payment reminders, quotes — professional, personal, ready to send.",
  },
  {
    icon: "check",
    title: "Decision Guard",
    text: "Before you give that discount or take that deal, a 60-second gut check catches expensive mistakes.",
  },
  {
    icon: "money",
    title: "Money without the spreadsheet",
    text: "Income, expenses, receipts, monthly profit — plus one-click tax export.",
  },
  {
    icon: "receipt",
    title: "Quotes & invoices",
    text: "Create, print, mark paid — and the income logs itself, linked to the customer.",
  },
  {
    icon: "work",
    title: "A plan for every day",
    text: "Your tasks, follow-ups, and a daily plan telling you what to tackle first.",
  },
];

const STEPS = [
  {
    icon: "plus" as IconName,
    title: "Sign up free",
    text: "Tell us about your business. Your customers, calendar and money pages are ready right away.",
  },
  {
    icon: "send" as IconName,
    title: "Find people and reach out",
    text: "Search local businesses that fit, then send a friendly email from the app.",
  },
  {
    icon: "calendar" as IconName,
    title: "Get booked and paid",
    text: "They pick a time on your booking page. You send the invoice and mark it paid.",
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
    <div className="ls-page flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-4 sm:px-8">
        <Link href="/" className="text-xl font-bold text-indigo-600">
          Jephelen
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
          <Link
            href="/pricing"
            className="whitespace-nowrap rounded-md px-1.5 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 sm:px-3"
          >
            Plans
          </Link>
          <Link
            href="/login"
            className="whitespace-nowrap rounded-md px-1.5 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 sm:px-3"
          >
            Log in
          </Link>
          <Link href="/signup" className="btn-primary btn-sm whitespace-nowrap sm:!px-4 sm:!py-2">
            Get started free
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="ls-hero">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 sm:px-8 sm:pt-14 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:pb-24 lg:pt-20">
            <div className="text-center lg:text-left">
              <p className="eyebrow">For freelancers and small businesses</p>
              <h1 className="ls-title mt-3">
                Find customers, book them, get paid{" "}
                <span className="text-indigo-600">— in one app.</span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8 lg:mx-0">
                Sign up and your business is set up. Find local people who need
                you, send them an email, and watch the booking land on your
                calendar.
              </p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Link href="/signup" className="btn-primary ls-cta">
                  Start free — no card needed
                </Link>
                <span className="text-sm text-slate-500">
                  Have an account?{" "}
                  <Link href="/login" className="link">
                    Log in
                  </Link>
                </span>
              </div>
            </div>
            <Story />
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-8">
          <Reveal>
            <p className="eyebrow text-center">How it works</p>
            <h2 className="ls-h2 mt-2 text-center">Three steps from new to booked</h2>
          </Reveal>
          <ol className="ls-how mt-10">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <Reveal delay={i * 140} className="ls-how-item">
                  <span className="ls-how-num">
                    <Icon name={s.icon} className="h-5 w-5" />
                    <b>{i + 1}</b>
                  </span>
                  <h3 className="section-title mt-4">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-500">{s.text}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section className="ls-feat-wrap">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-8">
            <Reveal>
              <p className="eyebrow text-center">What&apos;s inside</p>
              <h2 className="ls-h2 mt-2 text-center">Everything a small business runs on</h2>
            </Reveal>
            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={(i % 4) * 90} className="h-full">
                  <div className="card card-hover h-full p-5">
                    <span className="ls-feat-ic">
                      <Icon name={f.icon} className="h-5 w-5" />
                    </span>
                    <h3 className="section-title mt-3">{f.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-slate-500">{f.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Closing call */}
        <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-8">
          <Reveal>
            <h2 className="ls-h2">Spend your day on the work, not the admin.</h2>
            <p className="mt-3 text-slate-600">Free to start. No card needed.</p>
            <Link href="/signup" className="btn-primary ls-cta mt-7">
              Start free — no card needed
            </Link>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-slate-200 px-4 py-6 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} Jephelen</span>
          <div className="flex gap-4">
            <Link href="/pricing" className="hover:text-slate-600">
              Plans
            </Link>
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
