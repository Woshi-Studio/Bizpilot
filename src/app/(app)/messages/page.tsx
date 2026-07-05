import { requireUserAndBusiness } from "@/lib/data";
import { aiConfigured } from "@/lib/ai";
import MessageGenerator from "./message-generator";

export const metadata = { title: "AI Messages" };

export default async function MessagesPage() {
  const { supabase, business } = await requireUserAndBusiness();

  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, company")
    .eq("business_id", business.id)
    .order("name");

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-900">AI Messages</h1>
      <p className="mt-1 text-sm text-slate-500">
        Follow-ups, payment reminders, quotes — written for you, ready to send.
      </p>

      {!aiConfigured() && (
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          AI isn&apos;t connected yet. Add your <code>ANTHROPIC_API_KEY</code>{" "}
          to <code>.env.local</code> and restart the app.
        </p>
      )}

      <div className="mt-6">
        <MessageGenerator customers={customers ?? []} />
      </div>
    </div>
  );
}
