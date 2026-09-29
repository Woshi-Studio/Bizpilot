"use client";

// Pauses the story's CSS animations while it is off screen, so a phone
// scrolled down the page (or a hidden tab) does no animation work.
// Adds/removes the "ls-paused" class; the rule is in app/landing.css.

import { useEffect, useRef, type ReactNode } from "react";

export default function PauseOffscreen({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      el.classList.toggle("ls-paused", !e.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return <div ref={ref}>{children}</div>;
}
