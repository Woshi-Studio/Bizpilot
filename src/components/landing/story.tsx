"use client";

// The looping product slideshow on the front page. 9 scenes x 2.5 s:
// sign up -> set up -> leads -> daily plan -> email -> Decision Guard ->
// follow-ups -> lead alert -> booked + paid.
// The motion is plain CSS keyframes (see app/landing.css), transform and
// opacity only. This component only:
//   - pauses the loop while it is off screen,
//   - lets a visitor jump to a scene by tapping its step
//     (sets --off and restarts the animations from there).
// With "reduce motion" on, it shows one still scene (the tapped one).
// Names in it are made up; it is an illustration.

import { useEffect, useRef, useState, type CSSProperties } from "react";

const SCENE_S = 2.5;

type Vars = CSSProperties & { "--d"?: string; "--sd"?: string; "--off"?: string };
const at = (d: number): Vars => ({ "--d": `${d}s` });
const scene = (i: number): Vars => ({ "--sd": `${i * SCENE_S}s` });

const STEPS = [
  "Sign up",
  "Set up",
  "Leads",
  "Plan",
  "Email",
  "Decide",
  "Follow up",
  "Alerts",
  "Booked",
];
const CAPTIONS = [
  "Sign up free",
  "Your business is set up",
  "Find local leads",
  "Your plan for today",
  "Emails ready to send",
  "A gut check before a big call",
  "Who to follow up today",
  "New leads, straight to you",
  "Booked and paid",
];

export default function Story() {
  const ref = useRef<HTMLElement>(null);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      el.classList.toggle("ls-paused", !e.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  function jump(i: number) {
    const el = ref.current;
    if (!el) return;
    setPicked(i);
    el.style.setProperty("--off", `${i * SCENE_S}s`);
    // restart every animation so scene i plays from its start
    el.classList.add("ls-reset");
    void el.offsetWidth;
    el.classList.remove("ls-reset");
  }

  return (
    <figure
      ref={ref}
      className="ls-story"
      data-scene={picked ?? 8}
      aria-label="How Jephelen works: sign up, set up, find leads, plan the day, email, check decisions, follow up, get lead alerts, get booked and paid"
    >
      <div className="ls-stage" aria-hidden="true">
        <div className="ls-bar">
          <span />
          <span />
          <span />
          <b>jephelen</b>
        </div>

        {/* 1. Sign up */}
        <div className="ls-scene ls-scene-0" style={scene(0)}>
          <div className="ls-signup">
            <div className="ls-logo">J</div>
            <p className="ls-h">Create your account</p>
            <div className="ls-field">
              <small>Business name</small>
              <span className="ls-type" style={at(0.25)}>Sunny Paws Grooming</span>
            </div>
            <div className="ls-field">
              <small>Email</small>
              <span className="ls-type" style={at(0.75)}>hello@sunnypaws.test</span>
            </div>
            <div className="ls-btn ls-press" style={at(1.35)}>
              Start free
              <span className="ls-btn-ok ls-in" style={at(1.5)}>✓ You&apos;re in</span>
            </div>
          </div>
        </div>

        {/* 2. The dashboard sets itself up */}
        <div className="ls-scene ls-scene-1" style={scene(1)}>
          <div className="ls-dash">
            <div className="ls-side">
              {[0.05, 0.12, 0.19, 0.26, 0.33].map((d) => (
                <i key={d} className="ls-in" style={at(d)} />
              ))}
            </div>
            <div className="ls-dmain">
              <p className="ls-h ls-in" style={at(0.1)}>Good morning, Sunny Paws</p>
              <div className="ls-tiles">
                <div className="ls-tile ls-in" style={at(0.3)}>
                  <em className="ls-ic ls-ic-a">👥</em>
                  <b>Customers</b>
                  <span className="ls-lines"><i /><i /><i /></span>
                </div>
                <div className="ls-tile ls-in" style={at(0.5)}>
                  <em className="ls-ic ls-ic-b">📅</em>
                  <b>Calendar</b>
                  <span className="ls-minical">
                    {Array.from({ length: 14 }, (_, k) => (
                      <i key={k} className={k === 9 ? "on" : undefined} />
                    ))}
                  </span>
                </div>
                <div className="ls-tile ls-in" style={at(0.7)}>
                  <em className="ls-ic ls-ic-c">💰</em>
                  <b>Money</b>
                  <span className="ls-bars">
                    <i style={{ height: "40%" }} />
                    <i style={{ height: "65%" }} />
                    <i style={{ height: "50%" }} />
                    <i style={{ height: "85%" }} />
                  </span>
                </div>
                <div className="ls-tile ls-in" style={at(0.9)}>
                  <em className="ls-ic ls-ic-d">✅</em>
                  <b>Tasks</b>
                  <span className="ls-lines"><i /><i /></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Lead Finder */}
        <div className="ls-scene ls-scene-2" style={scene(2)}>
          <div className="ls-finder">
            <div className="ls-map">
              <svg viewBox="0 0 200 180" preserveAspectRatio="xMidYMid slice">
                <rect width="200" height="180" className="ls-map-bg" />
                <rect x="112" y="18" width="60" height="42" rx="6" className="ls-park" />
                <path d="M0 70 H200 M0 128 H200 M58 0 V180 M140 0 V180" className="ls-road" />
                <path d="M0 100 C60 90 110 150 200 110" className="ls-road ls-road-s" />
              </svg>
              {[
                [24, 36, 0.2],
                [66, 58, 0.4],
                [40, 82, 0.6],
                [84, 22, 0.8],
              ].map(([l, t, d]) => (
                <span key={d} className="ls-pin" style={{ left: `${l}%`, top: `${t}%` }}>
                  <span className="ls-drop" style={at(d)}><i /></span>
                </span>
              ))}
              <div className="ls-search ls-in" style={at(0.05)}>🔍 pet businesses near me</div>
            </div>
            <div className="ls-cards">
              <div className="ls-lead ls-slide" style={at(0.6)}>
                <b>Maple Street Vet</b>
                <small>0.8 km · fits: pet owners</small>
              </div>
              <div className="ls-lead ls-slide" style={at(0.85)}>
                <b>Oak Lane Kennels</b>
                <small>1.4 km · fits: pet care</small>
              </div>
              <div className="ls-lead ls-slide" style={at(1.1)}>
                <b>Pawsome Pet Shop</b>
                <small>2.1 km · fits: pet owners</small>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Today's plan, ticking off */}
        <div className="ls-scene ls-scene-3" style={scene(3)}>
          <div className="ls-panel">
            <p className="ls-h"><span className="ls-spark">✦</span>Today&apos;s plan</p>
            <ul className="ls-plan">
              {[
                ["Call Maple Street Vet back", 0.45],
                ["Send the quote to Oak Lane", 0.95],
                ["Log this week's receipts", 1.45],
                ["Post opening hours", -1],
              ].map(([t, d]) => (
                <li key={t as string} className="ls-in" style={at(0.1)}>
                  <span className="ls-box">
                    {(d as number) >= 0 && <span className="ls-tick ls-in" style={at(d as number)}>✓</span>}
                  </span>
                  <span className="ls-task">
                    {t}
                    {(d as number) >= 0 && <span className="ls-strike" style={at((d as number) + 0.08)} />}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 5. Email drafted, then sent */}
        <div className="ls-scene ls-scene-4" style={scene(4)}>
          <div className="ls-mail">
            <div className="ls-mrow">
              <small>To</small>
              <span className="ls-chip ls-in" style={at(0.1)}>Maple Street Vet</span>
            </div>
            <div className="ls-mrow">
              <small>Subject</small>
              <span className="ls-type" style={at(0.25)}>Grooming for your clients?</span>
            </div>
            <div className="ls-mbody">
              <span className="ls-draft ls-in" style={at(0.45)}>✦ Draft ready, edit anything</span>
              <span className="ls-type ls-line" style={at(0.55)}>Hi! We&apos;re a grooming shop two streets away.</span>
              <span className="ls-type ls-line" style={at(0.8)}>Happy to offer your clients a first visit.</span>
              <span className="ls-type ls-line" style={at(1.05)}>Pick any time here: book.sunnypaws</span>
            </div>
            <div className="ls-btn ls-send ls-press" style={at(1.5)}>Send</div>
            <div className="ls-toast ls-in" style={at(1.65)}>Sent ✓</div>
          </div>
        </div>

        {/* 6. Decision Guard */}
        <div className="ls-scene ls-scene-5" style={scene(5)}>
          <div className="ls-panel">
            <p className="ls-eyebrow">Decision Guard</p>
            <p className="ls-h">Give a 20% discount?</p>
            <div className="ls-q ls-in" style={at(0.3)}>
              <small>After this discount, do you still make a decent profit?</small>
              <span className="ls-ans ls-in" style={at(0.65)}>Not really</span>
            </div>
            <div className="ls-meter ls-in" style={at(0.95)}>
              <span className="ls-meter-track">
                <span className="ls-meter-fill" style={at(1.0)} />
              </span>
              <b className="ls-risk ls-in" style={at(1.3)}>Medium risk</b>
            </div>
            <p className="ls-verdict ls-in" style={at(1.5)}>
              Proceed, but fix the weak spots first.
            </p>
          </div>
        </div>

        {/* 7. Follow-ups the app noticed */}
        <div className="ls-scene ls-scene-6" style={scene(6)}>
          <div className="ls-panel">
            <p className="ls-h">Jephelen noticed</p>
            <p className="ls-sub ls-in" style={at(0.15)}>🔔 3 customers to follow up today</p>
            <div className="ls-people">
              {[
                ["Maple Street Vet", "follow-up due today", 0.4],
                ["Rosa M.", "invoice due, not paid", 0.65],
                ["Oak Lane Kennels", "no follow-up planned", 0.9],
              ].map(([n, why, d]) => (
                <div key={n as string} className="ls-person ls-slide" style={at(d as number)}>
                  <span className="ls-av">{(n as string)[0]}</span>
                  <span>
                    <b>{n}</b>
                    <small>{why}</small>
                  </span>
                  <span className="ls-mini">Follow up</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 8. Lead alert: bell + email */}
        <div className="ls-scene ls-scene-7" style={scene(7)}>
          <div className="ls-alert">
            <div className="ls-bell-wrap">
              <span className="ls-bell" style={at(0.25)}>🔔</span>
              <span className="ls-badge ls-in" style={at(0.3)}>3</span>
            </div>
            <div className="ls-inbox">
              <div className="ls-row ls-dim"><b>Supplier</b><small>Your order shipped</small></div>
              <div className="ls-row ls-new ls-slide" style={at(0.55)}>
                <span className="ls-dot" />
                <b>Jephelen</b>
                <small>3 new leads found for you</small>
              </div>
              <div className="ls-row ls-dim"><b>Rosa M.</b><small>Thanks for today!</small></div>
            </div>
            <div className="ls-leadpills">
              <span className="ls-in" style={at(1.0)}>Happy Tails Daycare</span>
              <span className="ls-in" style={at(1.15)}>Bark Park Café</span>
              <span className="ls-in" style={at(1.3)}>Northside Vet</span>
            </div>
          </div>
        </div>

        {/* 9. Booked and paid */}
        <div className="ls-scene ls-scene-8" style={scene(8)}>
          <div className="ls-cal">
            <p className="ls-h">This week</p>
            <div className="ls-week">
              {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
                <div key={d} className="ls-day"><small>{d}</small></div>
              ))}
              <span className="ls-ev ls-ev-a" />
              <span className="ls-ev ls-ev-b" />
              <span className="ls-ev ls-ev-c" />
              <div className="ls-book ls-land" style={at(0.25)}>
                <b>10:00</b> Maple Street Vet
              </div>
            </div>
            <div className="ls-notes">
              <span className="ls-note ls-in" style={at(0.85)}>📩 New booking</span>
              <span className="ls-paid ls-in" style={at(1.3)}>Invoice paid ✓</span>
            </div>
          </div>
        </div>
      </div>

      {/* current scene name (phones) */}
      <div className="ls-caption" aria-hidden="true">
        {CAPTIONS.map((c, i) => (
          <span key={c} className={`ls-cap ls-cap-${i}`} style={scene(i)}>
            {c}
          </span>
        ))}
      </div>

      {/* tap a step to jump to it */}
      <ol className="ls-steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              className={`ls-step ls-step-${i}`}
              onClick={() => jump(i)}
              aria-label={`Show: ${CAPTIONS[i]}`}
            >
              <span className="ls-track"><i /></span>
              <span className="ls-step-label">{s}</span>
            </button>
          </li>
        ))}
      </ol>
    </figure>
  );
}
