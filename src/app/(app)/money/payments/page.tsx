import { requireUserAndBusiness } from "@/lib/data";
import { loadBusinessLines } from "@/lib/activities";
import { loadLineSettings } from "@/lib/services-data";
import { settingsFor } from "@/lib/line-settings";
import type { PaymentMethod } from "@/lib/types";
import PaymentMethodsForm from "./payment-methods-form";
import LineSettingsForm from "./line-settings-form";

export const metadata = { title: "Payments" };

// Money -> Payments: how customers pay you (the methods printed on invoices)
// and each business line's currency, tax and due days. Moved here from
// Settings (old links /settings/payments redirect).
export default async function PaymentsPage() {
  const { supabase, business } = await requireUserAndBusiness();
  const [methodsResult, usedLines, saved] = await Promise.all([
    supabase.from("payment_methods").select("*").eq("business_id", business.id).order("position"),
    loadBusinessLines(supabase, business.id),
    loadLineSettings(supabase, business.id),
  ]);
  const methods = methodsResult.error ? [] : ((methodsResult.data ?? []) as PaymentMethod[]);
  const lineSettings = usedLines.map((l) => settingsFor(l, saved, business.currency ?? "USD"));

  return (
    <div className="mx-auto max-w-6xl [&>*]:max-w-4xl">
      <h1 className="page-title">Payments</h1>
      <p className="page-sub">How customers pay you, and the currency, tax and due days on your invoices.</p>
      <div id="payments" className="mt-6 scroll-mt-24">
        <PaymentMethodsForm methods={methods} />
      </div>
      <div id="lines" className="mt-8 scroll-mt-24">
        <LineSettingsForm settings={lineSettings} />
      </div>
    </div>
  );
}
