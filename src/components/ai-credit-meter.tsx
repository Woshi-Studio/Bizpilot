import { requireUserAndBusiness } from "@/lib/data";
import { getAiCredits, creditMeterText } from "@/lib/ai-quota";

// Small server-rendered line: "AI credits today: 7 of 25 · resets at
// midnight UTC". Shows nothing if usage can't be read.
export default async function AiCreditMeter({
  className = "",
}: {
  className?: string;
}) {
  const { supabase, business } = await requireUserAndBusiness();
  const credit = await getAiCredits(supabase, business);
  if (!credit) return null;

  const out = !credit.unlimited && credit.used >= credit.limit;

  return (
    <p
      className={`text-xs ${out ? "text-amber-700" : "text-slate-500"} ${className}`}
    >
      {creditMeterText(credit)}
    </p>
  );
}
