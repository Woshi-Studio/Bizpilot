"use client";

import { useRef, useState } from "react";
import Icon from "@/components/icons";
import { copyText } from "@/lib/copy-text";

// The booking link in a read-only box, with Copy and Open. The box is
// always there, so the link can be copied by hand if the browser blocks
// the Copy button (tap the box: the whole link is selected).
//   big: inside the "Your page is live" popup
//   bar: the thin strip at the top of Calendar / Settings → Booking
export default function BookingLinkBox({ url, variant = "bar" }: { url: string; variant?: "big" | "bar" }) {
  const box = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");

  const selectAll = () => {
    const el = box.current;
    if (!el) return;
    el.focus();
    el.select();
    el.setSelectionRange(0, el.value.length);
  };

  const copy = async () => {
    const ok = await copyText(url);
    if (ok) {
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
    } else {
      // The browser said no: select the link so Ctrl+C / "Copy" just works.
      selectAll();
      setState("manual");
    }
  };

  const big = variant === "big";
  const msg =
    state === "manual"
      ? "Your browser blocked the Copy button. The link is selected — press Ctrl+C (or long-press → Copy)."
      : state === "copied"
        ? big
          ? "Copied. Paste it anywhere: email, text, Instagram bio."
          : ""
        : big
          ? "Anyone with this link can book a time with you."
          : "";
  return (
    <div className="w-full min-w-0">
      <div className={`flex min-w-0 gap-2 ${big ? "flex-col" : "flex-wrap items-center sm:flex-nowrap"}`}>
        {big ? (
          // The whole link, wrapped, never cut off.
          <textarea
            ref={box}
            readOnly
            rows={2}
            value={url}
            aria-label="Your booking link"
            onFocus={selectAll}
            onClick={selectAll}
            className="input min-w-0 flex-1 resize-none field-sizing-content break-all py-2.5! font-mono text-base! font-semibold leading-snug text-ink sm:text-lg!"
          />
        ) : (
          <input
            ref={box}
            readOnly
            value={url}
            aria-label="Your booking link"
            onFocus={selectAll}
            onClick={selectAll}
            className="input min-w-0 flex-1 basis-full py-1.5! font-mono text-sm sm:basis-auto"
          />
        )}
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={copy}
            className={`${big ? "btn-primary flex-1 py-3!" : "btn-secondary btn-sm"} ${state === "copied" ? "bg-green-600! border-green-600! text-white!" : ""}`}
          >
            {state !== "copied" && <Icon name="copy" className="h-4 w-4" />}
            {state === "copied" ? "✓ Copied" : "Copy"}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={big ? "btn-secondary flex-1 py-3!" : "btn-ghost btn-sm"}
          >
            <Icon name="globe" className="h-4 w-4" />
            {big ? "Open page" : "Open"}
          </a>
        </div>
      </div>
      <p role="status" aria-live="polite" className={`text-xs ${msg ? "mt-1.5" : "sr-only"} ${state === "manual" ? "text-amber-700" : "text-muted"}`}>
        {msg}
      </p>
    </div>
  );
}
