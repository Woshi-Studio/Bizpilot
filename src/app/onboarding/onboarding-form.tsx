"use client";

import { useActionState, useState } from "react";
import { BUSINESS_TYPES, PRIMARY_GOALS } from "@/lib/types";
import { completeOnboarding, type OnboardingState } from "./actions";

const initialState: OnboardingState = {};

export default function OnboardingForm({
  initialName,
}: {
  initialName: string;
}) {
  const [state, formAction, pending] = useActionState(
    completeOnboarding,
    initialState
  );
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState(initialName);
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [primaryGoal, setPrimaryGoal] = useState("");

  const steps = ["About you", "Your work", "Your goal"];
  const canContinue =
    step === 0
      ? fullName.trim() !== "" && businessName.trim() !== ""
      : step === 1
        ? businessType !== ""
        : primaryGoal !== "";

  return (
    <form action={formAction}>
      {/* Keep every answer submitted regardless of the visible step */}
      <input type="hidden" name="full_name" value={fullName} />
      <input type="hidden" name="business_name" value={businessName} />
      <input type="hidden" name="business_type" value={businessType} />
      <input type="hidden" name="primary_goal" value={primaryGoal} />

      <div className="mb-6 flex items-center gap-2">
        {steps.map((label, i) => (
          <div key={label} className="flex-1">
            <div
              className={`h-1.5 rounded-full ${
                i <= step ? "bg-indigo-600" : "bg-slate-200"
              }`}
            />
            <p
              className={`mt-1.5 text-xs ${
                i === step ? "font-medium text-indigo-600" : "text-slate-400"
              }`}
            >
              {label}
            </p>
          </div>
        ))}
      </div>

      {state.error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="onb_full_name"
              className="block text-sm font-medium text-slate-700"
            >
              Your name
            </label>
            <input
              id="onb_full_name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label
              htmlFor="onb_business_name"
              className="block text-sm font-medium text-slate-700"
            >
              Business name
            </label>
            <input
              id="onb_business_name"
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Jane Doe Design"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-slate-400">
              Freelancing under your own name? Just use that.
            </p>
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <p className="text-sm font-medium text-slate-700">
            What kind of freelance work do you do?
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {BUSINESS_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setBusinessType(t.value)}
                className={`rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                  businessType === t.value
                    ? "border-indigo-600 bg-indigo-50 font-medium text-indigo-700"
                    : "border-slate-300 text-slate-700 hover:border-indigo-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <p className="text-sm font-medium text-slate-700">
            What do you most want BizPilot to help with?
          </p>
          <div className="mt-3 space-y-2">
            {PRIMARY_GOALS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setPrimaryGoal(g.value)}
                className={`block w-full rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                  primaryGoal === g.value
                    ? "border-indigo-600 bg-indigo-50 font-medium text-indigo-700"
                    : "border-slate-300 text-slate-700 hover:border-indigo-300"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className={`text-sm font-medium text-slate-500 hover:text-slate-700 ${
            step === 0 ? "invisible" : ""
          }`}
        >
          Back
        </button>
        {step < 2 ? (
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => setStep((s) => s + 1)}
            className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
          >
            Continue
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canContinue || pending}
            className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
          >
            {pending ? "Setting up..." : "Finish setup"}
          </button>
        )}
      </div>
    </form>
  );
}
