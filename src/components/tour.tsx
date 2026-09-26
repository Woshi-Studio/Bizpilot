"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { firstContactHref, markTourDone } from "@/app/(app)/profile-actions";

// The welcome tour: 6 short steps with a spotlight and a tooltip.
// Starts by itself on first login (profiles.tour_done_at is empty); the
// "?" button in the top bar replays it (it fires TOUR_EVENT).
// No package: plain DOM measuring + a fixed overlay.

export const TOUR_EVENT = "jephelen-tour-start";
const DONE_KEY = "jephelen-tour-done";

type Step = {
  target: string; // data-tour value
  title: string;
  body: string;
  // no target on the page (e.g. no contacts yet)
  fallback?: string;
};

const STEPS: Step[] = [
  {
    target: "nav-home",
    title: "This is Home",
    body: "Your day at a glance: what to do today, who to follow up with, and your money this month.",
  },
  {
    target: "nav-people",
    title: "People",
    body: "All your customers and leads live here. Tap a name to open their page.",
  },
  {
    target: "contact-actions",
    title: "One tap to act",
    body: "Every contact's page has this bar. Send an email, add an invoice or book a meeting right from here.",
    fallback: "Add your first customer in People. Their page has a bar to email them, add an invoice or book a meeting in one tap.",
  },
  {
    target: "nav-work",
    title: "Work and Calendar",
    body: "Your to-do list and your calendar. Book meetings and see what's coming up.",
  },
  {
    target: "nav-money",
    title: "Money",
    body: "Invoices, quotes, income and expenses. See who owes you and send reminders.",
  },
  {
    target: "athena",
    title: "Meet Athena",
    body: "Stuck? Ask Athena. She answers “how do I…” questions and writes messages for you.",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

function visibleTarget(name: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`));
  return (
    all.find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }) ?? null
  );
}

export default function Tour({ autoStart }: { autoStart: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [missing, setMissing] = useState(false);
  const [contactHref, setContactHref] = useState<string | null | undefined>(undefined);
  const boxRef = useRef<HTMLDivElement>(null);

  // Moves to a step and forgets the old spotlight.
  const go = useCallback((n: number) => {
    setRect(null);
    setMissing(false);
    setStep(n);
  }, []);
  const start = useCallback(() => go(0), [go]);

  const finish = useCallback(() => {
    setStep(null);
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {
      // storage blocked
    }
    void markTourDone();
  }, []);

  // First login: start once.
  useEffect(() => {
    if (!autoStart) return;
    let seen = false;
    try {
      seen = localStorage.getItem(DONE_KEY) === "1";
    } catch {
      // ignore
    }
    if (!seen) {
      const t = setTimeout(start, 600);
      return () => clearTimeout(t);
    }
  }, [autoStart, start]);

  // "?" button
  useEffect(() => {
    window.addEventListener(TOUR_EVENT, start);
    return () => window.removeEventListener(TOUR_EVENT, start);
  }, [start]);

  // Step 3 needs a contact page open.
  useEffect(() => {
    if (step !== 2) return;
    if (/^\/(customers|leads)\/[0-9a-f-]{36}/i.test(pathname)) return;
    let cancelled = false;
    (async () => {
      const href = contactHref === undefined ? await firstContactHref().catch(() => null) : contactHref;
      if (cancelled) return;
      setContactHref(href);
      if (href) router.push(href);
    })();
    return () => {
      cancelled = true;
    };
  }, [step, pathname, contactHref, router]);

  // Find and measure the current target (it may appear after navigation).
  useLayoutEffect(() => {
    if (step === null) return;
    const s = STEPS[step];
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    let el: HTMLElement | null = null;

    const measure = () => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    const look = () => {
      el = visibleTarget(s.target);
      if (el) {
        setMissing(false);
        if (s.target === "contact-actions") el.scrollIntoView({ block: "center" });
        measure();
        return;
      }
      // Waiting for the contact page to load, or there's nothing to show.
      const waitLonger = step === 2 && contactHref !== null;
      if (tries++ < (waitLonger ? 40 : 6)) {
        timer = setTimeout(look, 100);
      } else {
        setRect(null);
        setMissing(true);
      }
    };
    timer = setTimeout(look, 0);

    const onMove = () => measure();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [step, pathname, contactHref]);

  // Keyboard: Esc skips, arrows move.
  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight" && step < STEPS.length - 1) go(step + 1);
      if (e.key === "ArrowLeft" && step > 0) go(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, finish, go]);

  useEffect(() => {
    if (step !== null) boxRef.current?.focus();
  }, [step, rect, missing]);

  if (step === null) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const ready = rect || missing;
  const pad = 6;

  // Tooltip below the target, or above when there's no room.
  let boxStyle: React.CSSProperties = {
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
  };
  if (rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(320, vw - 32);
    const left = Math.max(16, Math.min(rect.left + rect.width / 2 - w / 2, vw - w - 16));
    const below = rect.top + rect.height + pad + 12;
    const roomBelow = vh - below;
    const nextTo = rect.left + rect.width + pad + 12;
    if (rect.height > vh * 0.5 && nextTo + w < vw) {
      // tall target (sidebar): put it to the right
      boxStyle = { left: nextTo, top: Math.max(16, Math.min(rect.top, vh - 220)), width: w };
    } else if (roomBelow > 190) {
      boxStyle = { left, top: below, width: w };
    } else {
      boxStyle = { left, bottom: vh - rect.top + pad + 12, width: w };
    }
  }

  return (
    <div className="fixed inset-0 z-[80] print:hidden" aria-live="polite">
      {/* dim + spotlight */}
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-2xl ring-2 ring-accent transition-all duration-200"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(6, 4, 18, 0.62)",
          }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-[rgba(6,4,18,0.62)]" />
      )}
      {/* clicks outside the tooltip do nothing (so the page doesn't move under the tour) */}
      <div className="fixed inset-0" onClick={(e) => e.stopPropagation()} />

      {ready && (
        <div
          ref={boxRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Welcome tour, step ${step + 1} of ${STEPS.length}`}
          tabIndex={-1}
          className="card fixed z-[81] w-[min(20rem,calc(100vw-2rem))] p-5 shadow-pop outline-none"
          style={boxStyle}
        >
          <p className="eyebrow">
            Step {step + 1} of {STEPS.length}
          </p>
          <h2 className="section-title mt-1">{s.title}</h2>
          <p className="mt-1.5 text-sm leading-6 text-ink-2">
            {missing && s.fallback ? s.fallback : s.body}
          </p>
          <div className="mt-4 flex items-center justify-between gap-2">
            <button type="button" onClick={finish} className="btn-ghost btn-sm">
              Skip
            </button>
            <div className="flex gap-2">
              {step > 0 && (
                <button type="button" onClick={() => go(step - 1)} className="btn-secondary btn-sm">
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() => (last ? finish() : go(step + 1))}
                className="btn-primary btn-sm"
              >
                {last ? "Let's go" : "Next"}
              </button>
            </div>
          </div>
          <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-accent" : "w-1.5 bg-line"}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
