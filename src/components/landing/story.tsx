// The looping product story on the front page:
// sign up -> set up -> leads -> email -> booked.
// Pure HTML + CSS keyframes (see app/landing.css): no JS, no images, no
// video. Only transform and opacity move, so it stays smooth. With
// "reduce motion" on, it shows one still frame (the booking).
// The names in it are made up, it is an illustration.

import type { CSSProperties } from "react";

type Delay = CSSProperties & { "--d"?: string; "--sd"?: string };
const at = (d: number): Delay => ({ "--d": `${d}s` });
const scene = (i: number): Delay => ({ "--sd": `${i * 3.2}s` });

const STEPS = ["Sign up", "Set up", "Find leads", "Email", "Booked"];

export default function Story() {
  return (
    <figure className="ls-story" aria-label="How Jephelen works: sign up, your business is set up, find leads, email them, get a booking">
      <div className="ls-stage" aria-hidden="true">
        {/* window chrome */}
        <div className="ls-bar">
          <span />
          <span />
          <span />
          <b>jephelen</b>
        </div>

        {/* 1. Sign up */}
        <div className="ls-scene" style={scene(0)}>
          <div className="ls-signup">
            <div className="ls-logo">J</div>
            <p className="ls-h">Create your account</p>
            <div className="ls-field">
              <small>Business name</small>
              <span className="ls-type" style={at(0.35)}>
                Sunny Paws Grooming
              </span>
            </div>
            <div className="ls-field">
              <small>Email</small>
              <span className="ls-type" style={at(0.95)}>
                hello@sunnypaws.test
              </span>
            </div>
            <div className="ls-btn ls-press" style={at(1.7)}>
              Start free
              <span className="ls-btn-ok ls-in" style={at(1.9)}>
                ✓ You&apos;re in
              </span>
            </div>
          </div>
        </div>

        {/* 2. The dashboard sets itself up */}
        <div className="ls-scene" style={scene(1)}>
          <div className="ls-dash">
            <div className="ls-side">
              <i className="ls-in" style={at(0.1)} />
              <i className="ls-in" style={at(0.2)} />
              <i className="ls-in" style={at(0.3)} />
              <i className="ls-in" style={at(0.4)} />
              <i className="ls-in" style={at(0.5)} />
            </div>
            <div className="ls-dmain">
              <p className="ls-h ls-in" style={at(0.15)}>
                Good morning, Sunny Paws
              </p>
              <div className="ls-tiles">
                <div className="ls-tile ls-in" style={at(0.45)}>
                  <em className="ls-ic ls-ic-a">👥</em>
                  <b>Customers</b>
                  <span className="ls-lines"><i /><i /><i /></span>
                </div>
                <div className="ls-tile ls-in" style={at(0.75)}>
                  <em className="ls-ic ls-ic-b">📅</em>
                  <b>Calendar</b>
                  <span className="ls-minical">
                    {Array.from({ length: 14 }, (_, k) => (
                      <i key={k} className={k === 9 ? "on" : undefined} />
                    ))}
                  </span>
                </div>
                <div className="ls-tile ls-in" style={at(1.05)}>
                  <em className="ls-ic ls-ic-c">💰</em>
                  <b>Money</b>
                  <span className="ls-bars">
                    <i style={{ height: "40%" }} />
                    <i style={{ height: "65%" }} />
                    <i style={{ height: "50%" }} />
                    <i style={{ height: "85%" }} />
                  </span>
                </div>
                <div className="ls-tile ls-in" style={at(1.35)}>
                  <em className="ls-ic ls-ic-d">✅</em>
                  <b>Tasks</b>
                  <span className="ls-lines"><i /><i /></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Lead Finder */}
        <div className="ls-scene" style={scene(2)}>
          <div className="ls-finder">
            <div className="ls-map">
              <svg viewBox="0 0 200 180" preserveAspectRatio="xMidYMid slice">
                <rect width="200" height="180" className="ls-map-bg" />
                <rect x="112" y="18" width="60" height="42" rx="6" className="ls-park" />
                <path d="M0 70 H200 M0 128 H200 M58 0 V180 M140 0 V180" className="ls-road" />
                <path d="M0 100 C60 90 110 150 200 110" className="ls-road ls-road-s" />
              </svg>
              <span className="ls-pin" style={{ left: "24%", top: "36%" }}>
                <span className="ls-drop" style={at(0.3)}><i /></span>
              </span>
              <span className="ls-pin" style={{ left: "66%", top: "58%" }}>
                <span className="ls-drop" style={at(0.6)}><i /></span>
              </span>
              <span className="ls-pin" style={{ left: "40%", top: "82%" }}>
                <span className="ls-drop" style={at(0.9)}><i /></span>
              </span>
              <span className="ls-pin" style={{ left: "84%", top: "22%" }}>
                <span className="ls-drop" style={at(1.2)}><i /></span>
              </span>
              <div className="ls-search ls-in" style={at(0.05)}>
                🔍 pet businesses near me
              </div>
            </div>
            <div className="ls-cards">
              <div className="ls-lead ls-slide" style={at(0.9)}>
                <b>Maple Street Vet</b>
                <small>0.8 km · fits: pet owners</small>
              </div>
              <div className="ls-lead ls-slide" style={at(1.25)}>
                <b>Oak Lane Kennels</b>
                <small>1.4 km · fits: pet care</small>
              </div>
              <div className="ls-lead ls-slide" style={at(1.6)}>
                <b>Pawsome Pet Shop</b>
                <small>2.1 km · fits: pet owners</small>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Email */}
        <div className="ls-scene" style={scene(3)}>
          <div className="ls-mail">
            <div className="ls-mrow">
              <small>To</small>
              <span className="ls-chip ls-in" style={at(0.15)}>Maple Street Vet</span>
            </div>
            <div className="ls-mrow">
              <small>Subject</small>
              <span className="ls-type" style={at(0.35)}>
                Grooming for your clients?
              </span>
            </div>
            <div className="ls-mbody">
              <span className="ls-type ls-line" style={at(0.8)}>
                Hi! We&apos;re a grooming shop two streets away.
              </span>
              <span className="ls-type ls-line" style={at(1.15)}>
                Happy to offer your clients a first visit.
              </span>
              <span className="ls-type ls-line" style={at(1.5)}>
                Pick any time here: book.sunnypaws
              </span>
            </div>
            <div className="ls-btn ls-send ls-press" style={at(1.95)}>
              Send
            </div>
            <div className="ls-toast ls-in" style={at(2.1)}>
              Sent ✓
            </div>
          </div>
        </div>

        {/* 5. Booked and paid */}
        <div className="ls-scene ls-last" style={scene(4)}>
          <div className="ls-cal">
            <p className="ls-h">This week</p>
            <div className="ls-week">
              {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
                <div key={d} className="ls-day">
                  <small>{d}</small>
                </div>
              ))}
              <span className="ls-ev ls-ev-a" />
              <span className="ls-ev ls-ev-b" />
              <span className="ls-ev ls-ev-c" />
              <div className="ls-book ls-land" style={at(0.35)}>
                <b>10:00</b> Maple Street Vet
              </div>
            </div>
            <div className="ls-notes">
              <span className="ls-note ls-in" style={at(1.1)}>
                📩 New booking
              </span>
              <span className="ls-paid ls-in" style={at(1.6)}>
                +$ paid
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* step labels with a progress line under each */}
      <ol className="ls-steps" aria-hidden="true">
        {STEPS.map((s, i) => (
          <li key={s} className={`ls-step ls-step-${i}`}>
            <span className="ls-track">
              <i />
            </span>
            {s}
          </li>
        ))}
      </ol>
    </figure>
  );
}
