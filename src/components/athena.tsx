"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { askAthena, type AthenaTurn } from "@/app/(app)/athena/actions";
import Icon from "./icons";
import { FAQ_BADGE } from "@/lib/help-faq";

const SUGGESTIONS = [
  "How do I send an invoice?",
  "Draft a friendly payment reminder",
  "Where do I book a meeting?",
  "What should I do first today?",
];

// **bold** -> <strong>, everything else as plain text (no HTML injection).
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-ink">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

function AthenaMark({ size = "h-9 w-9" }: { size?: string }) {
  return (
    <span
      className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-indigo-500 to-fuchsia-500 text-white shadow-sm`}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="currentColor">
        <path d="M12 2.5l2.1 5.4 5.4 2.1-5.4 2.1L12 17.5l-2.1-5.4L4.5 10l5.4-2.1L12 2.5Z" />
        <circle cx="18.5" cy="18.5" r="1.8" />
      </svg>
    </span>
  );
}

// The floating "Athena" helper on every page. Chat history lives only in
// this browser tab's memory; it's gone when the tab closes.
export default function Athena({ firstName }: { firstName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<AthenaTurn[]>([]);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, pending, error]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function send(text: string) {
    const q = text.trim();
    if (!q || pending) return;
    const next: AthenaTurn[] = [...turns, { role: "user", content: q.slice(0, 1500) }];
    setTurns(next);
    setInput("");
    setError("");
    startTransition(async () => {
      try {
        const res = await askAthena(next.slice(-12), pathname);
        if (res.answer) {
          setTurns((t) => [
            ...t,
            { role: "assistant", content: res.answer!, faq: res.source === "faq" },
          ]);
        } else {
          setError(res.error ?? "Hmm, that didn't work. Try again?");
        }
      } catch {
        setError("I lost the connection for a second. Try again? 💜");
      }
    });
  }

  async function copy(i: number, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // clipboard blocked — nothing to do
    }
  }

  return (
    <div className="print:hidden">
      {open && (
        <div
          role="dialog"
          aria-label="Athena assistant"
          className="fixed inset-x-3 bottom-[5.5rem] z-50 flex max-h-[min(34rem,calc(100dvh-8rem))] flex-col overflow-hidden rounded-[1.375rem] border border-line/70 bg-surface shadow-pop sm:inset-x-auto sm:right-6 sm:w-[23rem] lg:bottom-24"
        >
          <div className="flex items-center gap-3 border-b border-line/70 bg-gradient-to-r from-indigo-500/10 via-violet-500/5 to-transparent px-4 py-3.5">
            <AthenaMark />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Athena</p>
              <p className="text-xs text-muted">Your Jephelen helper · I suggest, you decide</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close Athena"
              className="rounded-lg p-1.5 text-muted hover:bg-surface-3 hover:text-ink"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <div className="flex gap-2.5">
              <AthenaMark size="h-7 w-7" />
              <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-surface-2 px-3.5 py-2.5 text-sm leading-6 text-ink-2">
                Hey {firstName}! I&apos;m Athena. Ask me how to do anything in Jephelen, or have me draft a message. ✨
              </div>
            </div>

            {turns.length === 0 && (
              <div className="flex flex-wrap gap-1.5 pl-9">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="chip text-xs">
                    {s}
                  </button>
                ))}
              </div>
            )}

            {turns.map((t, i) =>
              t.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-accent px-3.5 py-2.5 text-sm leading-6 text-white">
                    {t.content}
                  </p>
                </div>
              ) : (
                <div key={i} className="group flex gap-2.5">
                  <AthenaMark size="h-7 w-7" />
                  <div className="max-w-[85%]">
                    <div className="whitespace-pre-wrap rounded-2xl rounded-tl-md bg-surface-2 px-3.5 py-2.5 text-sm leading-6 text-ink-2">
                      <Rich text={t.content} />
                    </div>
                    {t.faq && (
                      <p className="mt-1 px-1 text-[11px] font-medium text-muted">
                        {FAQ_BADGE} · free, no credit used
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => copy(i, t.content)}
                      className="mt-1 inline-flex items-center gap-1 px-1 text-xs text-muted opacity-0 transition-opacity hover:text-ink group-hover:opacity-100 focus:opacity-100"
                    >
                      <Icon name="copy" className="h-3 w-3" />
                      {copied === i ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              )
            )}

            {pending && (
              <div className="flex gap-2.5">
                <AthenaMark size="h-7 w-7" />
                <div className="flex gap-1 rounded-2xl rounded-tl-md bg-surface-2 px-4 py-3.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-subtle" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-subtle [animation-delay:120ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-subtle [animation-delay:240ms]" />
                </div>
              </div>
            )}

            {error && <p className="alert-warn text-sm">{error}</p>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 border-t border-line/70 px-3 py-3"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              maxLength={1500}
              placeholder="Ask Athena…"
              aria-label="Message Athena"
              className="input max-h-28 min-h-[2.625rem] resize-none"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              aria-label="Send to Athena"
              className="btn-primary h-[2.625rem] w-[2.625rem] shrink-0 p-0!"
            >
              <Icon name="send" className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-tour="athena"
        aria-expanded={open}
        aria-label={open ? "Close Athena" : "Open Athena, your assistant"}
        className="fixed bottom-[5.5rem] right-4 z-50 flex items-center gap-2 rounded-full bg-surface py-1.5 pl-1.5 pr-4 text-sm font-semibold text-ink shadow-pop ring-1 ring-line/70 transition-transform hover:-translate-y-0.5 sm:right-6 lg:bottom-6"
        style={open ? { display: "none" } : undefined}
      >
        <AthenaMark />
        Athena
      </button>
      {open && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close Athena"
          className="fixed bottom-[5.5rem] right-4 z-50 hidden h-12 w-12 items-center justify-center rounded-full bg-surface text-ink shadow-pop ring-1 ring-line/70 sm:right-6 lg:bottom-6 lg:flex"
        >
          <Icon name="x" className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
