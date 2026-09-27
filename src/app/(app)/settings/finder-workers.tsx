"use client";

import { useActionState, useState } from "react";
import LocalTime from "@/components/local-time";
import { createWorkerKey, revokeWorkerKey, type WorkerKeyState } from "./finder-worker-actions";

export type WorkerRow = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
};

const initial: WorkerKeyState = {};

export default function FinderWorkers({ workers, ready }: { workers: WorkerRow[]; ready: boolean }) {
  const [state, action, pending] = useActionState(createWorkerKey, initial);
  const [copied, setCopied] = useState(false);

  return (
    <section className="card p-6">
      <h2 className="section-title">🔎 Lead Finder worker</h2>
      <p className="page-sub">
        Owner only. A worker key lets Zilla on your PC pick up searches and send back what it finds.
        It can&apos;t read anything else. Put it in <code className="text-xs">zilla\keys.json</code> as{" "}
        <code className="text-xs">worker_key</code>.
      </p>

      {!ready && (
        <p className="mt-4 rounded-md bg-surface-2 px-3 py-2 text-sm text-muted">
          Not set up yet: run migration 0019 and check AGENT_KEY_PEPPER + the service key.
        </p>
      )}

      {state.newKey && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            Key &quot;{state.newKeyName}&quot; created. Copy it now: it will not be shown again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-surface px-2 py-1 text-xs text-slate-800">
              {state.newKey}
            </code>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(state.newKey ?? "");
                setCopied(true);
              }}
              className="btn-sm btn shrink-0 bg-amber-600 text-white hover:bg-amber-500"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {ready && (
        <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="label min-w-0 flex-1">
            Key name
            <input name="name" required maxLength={60} placeholder="Zilla on the HQ PC" className="input mt-1" />
          </label>
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Creating..." : "Create worker key"}
          </button>
        </form>
      )}
      {state.error && <p className="alert-error mt-3">{state.error}</p>}

      {workers.length > 0 && (
        <div className="mt-6 divide-y divide-line/60 rounded-2xl border border-line/70">
          {workers.map((w) => (
            <div key={w.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {w.name} <code className="text-xs text-muted">jph_work_{w.key_prefix}…</code>
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Last seen: {w.last_seen_at ? <LocalTime iso={w.last_seen_at} /> : "never"}
                </p>
              </div>
              {w.revoked_at ? (
                <span className="shrink-0 text-xs font-medium text-muted">Revoked</span>
              ) : (
                <form action={revokeWorkerKey}>
                  <input type="hidden" name="id" value={w.id} />
                  <button type="submit" className="shrink-0 text-xs font-medium text-red-600 hover:text-red-500">
                    Revoke
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
