"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { askCoach, type CoachState } from "./actions";

const initialState: CoachState = {};

const SUGGESTIONS = [
  "How much should I set aside for taxes?",
  "My income is unstable month to month — what can I do?",
  "How do I raise my prices without losing clients?",
  "Should I take a client that haggles hard on price?",
];

export default function CoachChat() {
  const [state, formAction, pending] = useActionState(askCoach, initialState);
  const [history, setHistory] = useState<{ q: string; a: string }[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state.answer && state.question) {
      setHistory((h) =>
        h.some((e) => e.q === state.question && e.a === state.answer)
          ? h
          : [...h, { q: state.question!, a: state.answer! }]
      );
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <div>
      {history.length === 0 && !pending && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6">
          <p className="text-sm font-medium text-slate-600">
            Ask anything about running your business — the coach knows your
            numbers.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  if (inputRef.current) {
                    inputRef.current.value = s;
                    inputRef.current.focus();
                  }
                }}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:border-indigo-400 hover:text-indigo-600"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {history.map((e, i) => (
          <div key={i}>
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2.5 text-sm text-white">
              {e.q}
            </p>
            <div className="mt-2 w-fit max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm">
              {e.a}
            </div>
          </div>
        ))}
        {pending && (
          <div className="w-fit rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:120ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:240ms]" />
            </div>
          </div>
        )}
      </div>

      {state.error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <form ref={formRef} action={formAction} className="mt-6 flex gap-2">
        <textarea
          ref={inputRef}
          name="question"
          rows={2}
          required
          placeholder="e.g. Is it time to raise my prices?"
          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 self-end rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
        >
          Ask
        </button>
      </form>
      <p className="mt-2 text-xs text-slate-400">
        Educational guidance, not professional legal or tax advice.
      </p>
    </div>
  );
}
