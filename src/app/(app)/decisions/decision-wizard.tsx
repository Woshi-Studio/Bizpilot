"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  DECISION_TYPES,
  QUESTIONS,
  RISK_META,
  scoreDecision,
  type DecisionType,
} from "@/lib/decision-guard";
import {
  saveDecision,
  getDecisionAdvice,
  type SaveDecisionState,
  type AdviceState,
} from "./actions";

const initialState: SaveDecisionState = {};
const adviceInitial: AdviceState = {};

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

// Pro-only panel: personalized AI advice grounded in real numbers + history.
function AiAdvicePanel({
  type,
  title,
  amount,
  answers,
  isPremium,
}: {
  type: DecisionType;
  title: string;
  amount: string;
  answers: Record<string, string>;
  isPremium: boolean;
}) {
  const [state, action, pending] = useActionState(
    getDecisionAdvice,
    adviceInitial
  );

  return (
    <div className="mt-5 rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            🧠 Personalized AI advice{" "}
            <span className="ml-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Pro
            </span>
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Looks at your real numbers and how your past decisions turned out.
          </p>
        </div>
        {!state.advice && !state.locked && (
          <form action={action}>
            <input type="hidden" name="decision_type" value={type} />
            <input type="hidden" name="title" value={title} />
            <input type="hidden" name="amount" value={amount} />
            <input
              type="hidden"
              name="answers"
              value={JSON.stringify(answers)}
            />
            <button
              type="submit"
              disabled={pending}
              className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
            >
              {pending ? "Thinking..." : isPremium ? "Get advice" : "Get advice"}
            </button>
          </form>
        )}
      </div>

      {pending && (
        <div className="mt-3 flex gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-300" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-300 [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-300 [animation-delay:240ms]" />
        </div>
      )}
      {state.locked && (
        <div className="mt-3 rounded-md bg-white px-3 py-3 text-sm">
          <p className="font-medium text-slate-700">
            Personalized AI advice is a Pro feature.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Upgrade to get advice built around your real numbers and your
            decision history.
          </p>
          <Link
            href="/settings"
            className="mt-2 inline-block rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            Upgrade to Pro
          </Link>
        </div>
      )}
      {state.error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.advice && (
        <pre className="mt-3 whitespace-pre-wrap rounded-md bg-white px-3 py-3 font-sans text-sm leading-6 text-slate-700">
          {state.advice}
        </pre>
      )}
    </div>
  );
}

export default function DecisionWizard({
  isPremium = false,
}: {
  isPremium?: boolean;
}) {
  const [type, setType] = useState<DecisionType | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showResult, setShowResult] = useState(false);
  const [saveState, saveAction, saving] = useActionState(
    saveDecision,
    initialState
  );

  // Step 1: pick a decision type
  if (!type) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DECISION_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-colors hover:border-indigo-400"
          >
            <span className="text-2xl">{t.emoji}</span>
            <p className="mt-2 text-sm font-semibold text-slate-800">
              {t.label}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">{t.blurb}</p>
          </button>
        ))}
      </div>
    );
  }

  const questions = QUESTIONS[type];
  const typeMeta = DECISION_TYPES.find((t) => t.value === type)!;
  const allAnswered = questions.every((q) => answers[q.id]);
  const result = showResult ? scoreDecision(type, answers) : null;

  // Step 3: result
  if (result) {
    const meta = RISK_META[result.level];
    const pct = Math.round(
      (result.score / Math.max(result.maxScore, 1)) * 100
    );

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {typeMeta.emoji} {typeMeta.label}
          {title ? ` — ${title}` : ""}
        </p>

        <div className="mt-3 flex items-center gap-3">
          <span
            className={`inline-block rounded-full border px-3 py-1 text-sm font-semibold ${meta.badgeClass}`}
          >
            {meta.label}
          </span>
          <span className="text-xs text-slate-400">
            Risk score: {result.score} / {result.maxScore}
          </span>
        </div>

        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${meta.barClass}`}
            style={{ width: `${Math.max(pct, 4)}%` }}
          />
        </div>

        <p className="mt-4 text-sm font-medium text-slate-800">
          {result.verdict}
        </p>

        {result.recommendations.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-slate-800">
              Recommendations
            </h3>
            <ul className="mt-2 space-y-2">
              {result.recommendations.map((r, i) => (
                <li
                  key={i}
                  className="rounded-lg bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700"
                >
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        <AiAdvicePanel
          type={type}
          title={title || typeMeta.label}
          amount={amount}
          answers={answers}
          isPremium={isPremium}
        />

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {saveState.success ? (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              {saveState.success}
            </p>
          ) : (
            <form action={saveAction}>
              <input type="hidden" name="decision_type" value={type} />
              <input
                type="hidden"
                name="title"
                value={title || typeMeta.label}
              />
              <input type="hidden" name="amount" value={amount} />
              <input
                type="hidden"
                name="answers"
                value={JSON.stringify(answers)}
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save to history"}
              </button>
            </form>
          )}
          <button
            type="button"
            onClick={() => {
              setType(null);
              setTitle("");
              setAmount("");
              setAnswers({});
              setShowResult(false);
            }}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Check another decision
          </button>
          <Link
            href={`/messages?details=${encodeURIComponent(
              `Context: I ran a Decision Guard check on "${title || typeMeta.label}" (${meta.label.toLowerCase()}). ` +
                (result.recommendations[0]
                  ? `Key advice: ${result.recommendations[0]} `
                  : "") +
                `Write the message to the customer that follows this advice.`
            )}`}
            className="rounded-md border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
          >
            ✨ Write this message for me
          </Link>
          <Link
            href="/decisions"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            View history &rarr;
          </Link>
        </div>
        {saveState.error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {saveState.error}
          </p>
        )}
      </div>
    );
  }

  // Step 2: details + questions
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">
          {typeMeta.emoji} {typeMeta.label}
        </p>
        <button
          type="button"
          onClick={() => {
            setType(null);
            setAnswers({});
          }}
          className="text-sm text-slate-400 hover:text-slate-600"
        >
          &larr; Change type
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="dg_title"
            className="block text-sm font-medium text-slate-700"
          >
            What&apos;s the decision?
          </label>
          <input
            id="dg_title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder='e.g. "15% off for John Smith"'
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="dg_amount"
            className="block text-sm font-medium text-slate-700"
          >
            Amount involved <span className="text-slate-400">(optional)</span>
          </label>
          <input
            id="dg_amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-6 space-y-5">
        {questions.map((q, idx) => (
          <div key={q.id}>
            <p className="text-sm font-medium text-slate-700">
              {idx + 1}. {q.text}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {q.options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() =>
                    setAnswers((a) => ({ ...a, [q.id]: o.value }))
                  }
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                    answers[q.id] === o.value
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-slate-300 text-slate-600 hover:border-indigo-300"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          disabled={!allAnswered}
          onClick={() => setShowResult(true)}
          className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
        >
          {allAnswered
            ? "Check the risk"
            : `Answer all ${questions.length} questions`}
        </button>
      </div>
    </div>
  );
}
