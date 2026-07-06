import CoachChat from "./coach-chat";

export const metadata = { title: "Coach" };

export default function CoachPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">🎓 Business Coach</h1>
      <p className="mt-1 text-sm text-slate-500">
        A mentor that actually knows your business — it reads your real
        numbers before answering.
      </p>

      <div className="mt-6">
        <CoachChat />
      </div>
    </div>
  );
}
