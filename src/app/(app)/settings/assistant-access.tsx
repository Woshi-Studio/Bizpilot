"use client";

import { useActionState, useState } from "react";
import { AGENT_SCOPES } from "@/lib/agent/scopes";
import LocalTime from "@/components/local-time";
import { createApiKey, revokeApiKey, type CreateKeyState } from "./agent-actions";

export type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type AuditRow = {
  id: string;
  key_id: string | null;
  action: string;
  result: string | null;
  ok: boolean;
  created_at: string;
};

const initialState: CreateKeyState = {};

const inputClass =
  "mt-1 input";

function NewKeyBox({ keyText, name }: { keyText: string; name: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">
        Key &quot;{name}&quot; created. Copy it now: it will not be shown again.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-surface px-2 py-1 text-xs text-slate-800">
          {keyText}
        </code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(keyText);
            setCopied(true);
          }}
          className="btn-sm btn shrink-0 bg-amber-600 text-white hover:bg-amber-500"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export default function AssistantAccess({
  keys,
  audit,
  ready,
}: {
  keys: ApiKeyRow[];
  audit: AuditRow[];
  ready: boolean;
}) {
  const [state, formAction, pending] = useActionState(createApiKey, initialState);
  const keyNames = new Map(keys.map((k) => [k.id, k.name]));

  return (
    <div className="card p-6">
      <h2 className="section-title">🤖 Assistant access</h2>
      <p className="page-sub">
        Keys let your assistant add customers, leads, tasks and meetings for
        you. Each key only does what you tick. Revoke a key and it stops
        working at once.
      </p>

      {!ready && (
        <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Not set up yet: run migration 0016 in Supabase first.
        </p>
      )}

      {state.newKey && (
        <div className="mt-4">
          <NewKeyBox keyText={state.newKey} name={state.newKeyName ?? ""} />
        </div>
      )}

      {ready && (
        <form action={formAction} className="mt-4 space-y-3">
          {state.error && (
            <p className="alert-error">
              {state.error}
            </p>
          )}
          <label className="label">
            Key name
            <input
              name="name"
              required
              maxLength={60}
              placeholder="Marlene on Discord"
              className={inputClass}
            />
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">
              This key may
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {AGENT_SCOPES.map((s) => (
                <label key={s.value} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="scopes" value={s.value} defaultChecked />
                  <span>{s.label}</span>
                  <code className="text-[10px] text-slate-400">{s.value}</code>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pending}
              className="btn-primary"
            >
              {pending ? "Creating..." : "Create key"}
            </button>
          </div>
        </form>
      )}

      {keys.length > 0 && (
        <div className="mt-6 divide-y divide-slate-100 rounded-2xl border border-line/70">
          {keys.map((k) => (
            <div key={k.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">
                  {k.name}{" "}
                  <code className="text-xs text-slate-400">jph_live_{k.key_prefix}…</code>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{k.scopes.join(" · ")}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Last used:{" "}
                  {k.last_used_at ? <LocalTime iso={k.last_used_at} /> : "never"}
                </p>
              </div>
              {k.revoked_at ? (
                <span className="shrink-0 text-xs font-medium text-slate-400">Revoked</span>
              ) : (
                <form action={revokeApiKey}>
                  <input type="hidden" name="id" value={k.id} />
                  <button
                    type="submit"
                    className="shrink-0 text-xs font-medium text-red-600 hover:text-red-500"
                  >
                    Revoke
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      {audit.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Last {audit.length} assistant calls
          </summary>
          <div className="mt-2 max-h-96 overflow-y-auto rounded-2xl border border-line/70 text-xs">
            {audit.map((a) => (
              <div key={a.id} className="flex gap-3 border-b border-slate-50 px-3 py-1.5">
                <span className={a.ok ? "text-green-600" : "text-red-600"}>
                  {a.ok ? "✓" : "✗"}
                </span>
                <span className="w-32 shrink-0 text-slate-400">
                  <LocalTime iso={a.created_at} />
                </span>
                <span className="w-28 shrink-0 font-medium text-slate-700">{a.action}</span>
                <span className="min-w-0 truncate text-slate-500">
                  {(a.key_id && keyNames.get(a.key_id)) || "deleted key"} · {a.result}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
