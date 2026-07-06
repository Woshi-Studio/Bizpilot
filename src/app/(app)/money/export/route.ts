import { createClient } from "@/lib/supabase/server";
import { categoryLabel } from "@/lib/types";

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, currency")
    .eq("owner_id", user.id)
    .eq("onboarding_completed", true)
    .maybeSingle();

  if (!business) {
    return new Response("No business", { status: 400 });
  }

  const url = new URL(request.url);
  const yearParam = url.searchParams.get("year") ?? "";
  const year = /^\d{4}$/.test(yearParam)
    ? yearParam
    : String(new Date().getFullYear());

  const { data: transactions } = await supabase
    .from("transactions")
    .select("date, type, category, description, amount, customers(name)")
    .eq("business_id", business.id)
    .gte("date", `${year}-01-01`)
    .lte("date", `${year}-12-31`)
    .order("date");

  const rows = [
    ["Date", "Type", "Category", "Description", "Customer", `Amount (${business.currency})`],
    ...(transactions ?? []).map((t) => {
      const customer = t.customers as unknown as { name: string } | null;
      return [
        t.date,
        t.type,
        categoryLabel(t.category),
        t.description ?? "",
        customer?.name ?? "",
        String(t.amount),
      ];
    }),
  ];

  const income = (transactions ?? [])
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  const expenses = (transactions ?? [])
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);

  rows.push([]);
  rows.push(["Total income", "", "", "", "", income.toFixed(2)]);
  rows.push(["Total expenses", "", "", "", "", expenses.toFixed(2)]);
  rows.push(["Profit", "", "", "", "", (income - expenses).toFixed(2)]);

  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  const safeName = business.name.replace(/[^a-z0-9-_ ]/gi, "").trim() || "business";

  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName} ${year} transactions.csv"`,
    },
  });
}
