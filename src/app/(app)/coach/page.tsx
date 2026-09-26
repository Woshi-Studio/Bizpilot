import AiCreditMeter from "@/components/ai-credit-meter";
import CoachChat from "./coach-chat";

export const metadata = { title: "Coach" };

export default async function CoachPage() {
  return (
    <div className="mx-auto max-w-6xl [&>*]:max-w-2xl">
      <h1 className="page-title">🎓 Business Coach</h1>
      <p className="page-sub">
        A mentor that actually knows your business — it reads your real
        numbers before answering.
      </p>

      <AiCreditMeter className="mt-2" />

      <div className="mt-6">
        <CoachChat />
      </div>
    </div>
  );
}
