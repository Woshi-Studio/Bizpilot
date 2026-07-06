import type { SupabaseClient } from "@supabase/supabase-js";

export function addMonths(dateStr: string, months: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, 1));
  // Clamp the day to the target month's length (Jan 31 -> Feb 28)
  const daysInMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
  ).getUTCDate();
  date.setUTCDate(Math.min(d, daysInMonth));
  return date.toISOString().slice(0, 10);
}

// Materializes any due recurring templates into real transactions.
// Called from the money page on load — no cron needed.
export async function applyDueRecurring(
  supabase: SupabaseClient,
  businessId: string
) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: due } = await supabase
    .from("recurring_transactions")
    .select("*")
    .eq("business_id", businessId)
    .lte("next_date", today);

  for (const template of due ?? []) {
    let next = template.next_date as string;
    const inserts = [];
    while (next <= today) {
      inserts.push({
        business_id: businessId,
        customer_id: template.customer_id,
        type: template.type,
        amount: template.amount,
        category: template.category,
        description: template.description,
        date: next,
      });
      next = addMonths(next, 1);
    }
    if (inserts.length > 0) {
      const { error } = await supabase.from("transactions").insert(inserts);
      if (!error) {
        await supabase
          .from("recurring_transactions")
          .update({ next_date: next })
          .eq("id", template.id);
      }
    }
  }
}
