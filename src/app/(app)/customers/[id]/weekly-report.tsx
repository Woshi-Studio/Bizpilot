"use client";

import { useState } from "react";
import type { CustomerNote } from "@/lib/types";

type DoneTask = { title: string; description: string | null; completed_at: string | null };

export default function WeeklyReport({
  customerName,
  businessName,
  notes,
  doneTasks,
}: {
  customerName: string;
  businessName: string;
  notes: CustomerNote[];
  doneTasks: DoneTask[];
}) {
  const [report, setReport] = useState("");
  const [copied, setCopied] = useState(false);

  function generate() {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    const weekTasks = doneTasks.filter(
      (t) => (t.completed_at ?? "").slice(0, 10) >= weekStartStr
    );
    const weekNotes = notes.filter(
      (n) => n.created_at.slice(0, 10) >= weekStartStr
    );

    const lines = [
      `WEEKLY REPORT — ${businessName}`,
      `Client: ${customerName}`,
      `Week of: ${weekStart.toLocaleDateString()}`,
      `Generated: ${now.toLocaleString()}`,
      "=".repeat(50),
      "",
      "COMPLETED THIS WEEK:",
      weekTasks.length
        ? weekTasks
            .map((t) => `- ${t.title}${t.description ? " : " + t.description : ""}`)
            .join("\n")
        : "Nothing completed this week.",
      "",
      "NOTES & UPDATES:",
      weekNotes.length
        ? weekNotes.map((n) => n.body).join("\n\n")
        : "No notes this week.",
    ];

    setReport(lines.join("\n"));
    setCopied(false);
  }

  async function copy() {
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">
          Weekly report
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={generate}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Generate
          </button>
          {report && (
            <button
              type="button"
              onClick={copy}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          )}
        </div>
      </div>
      <textarea
        readOnly
        value={report}
        rows={8}
        placeholder="Click Generate to compile this week's completed tasks and notes into something you can copy and send."
        className="mt-3 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 shadow-sm"
      />
    </div>
  );
}
