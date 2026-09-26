"use client";

import { useState } from "react";
import { MAX_LINE_LENGTH, lineLabel } from "@/lib/business-lines";

const NEW = "__new__";

// Business line picker for create/edit forms: a dropdown of the known
// lines (the configured ones plus any already in use), with
// "+ New business…" to type one. Posts as `business_line`; the server
// normalizes it. Pass value + onChange to control it.
export default function BusinessLineInput({
  id,
  defaultValue,
  value,
  onChange,
  lines,
  className,
  label = "Business",
  showLabel = true,
  emptyLabel,
}: {
  id: string;
  defaultValue?: string | null;
  value?: string;
  onChange?: (line: string) => void;
  lines?: string[];
  className?: string;
  label?: string;
  showLabel?: boolean;
  emptyLabel?: string;
}) {
  const options = lines ?? [];
  const initial = value ?? defaultValue ?? "";
  const [own, setOwn] = useState(initial);
  const current = value ?? own;
  const known = current === "" || options.includes(current);
  const [typing, setTyping] = useState(!known);

  function set(v: string) {
    if (value === undefined) setOwn(v);
    onChange?.(v);
  }

  const empty =
    emptyLabel ?? (/customer/i.test(label) ? "Same as the customer" : "No business");

  return (
    <div>
      {showLabel && (
        <label htmlFor={id} className="label">
          {label.replace(/\s*\(empty = .*\)$/, "")}
        </label>
      )}
      <div className={`flex gap-2 ${showLabel ? "mt-1" : ""}`}>
        <select
          id={typing ? undefined : id}
          value={typing ? NEW : current}
          onChange={(e) => {
            if (e.target.value === NEW) {
              setTyping(true);
              set("");
            } else {
              setTyping(false);
              set(e.target.value);
            }
          }}
          aria-label={showLabel ? undefined : label}
          className={`${className ?? "input"} mt-0! ${typing ? "w-40! shrink-0" : ""}`}
        >
          <option value="">{empty}</option>
          {options.map((v) => (
            <option key={v} value={v}>
              {lineLabel(v)}
            </option>
          ))}
          <option value={NEW}>+ New business…</option>
        </select>
        {typing && (
          <input
            id={id}
            type="text"
            autoFocus
            maxLength={MAX_LINE_LENGTH}
            value={current}
            onChange={(e) => set(e.target.value)}
            placeholder="New business name"
            className={`${className ?? "input"} mt-0! flex-1`}
          />
        )}
      </div>
      <input type="hidden" name="business_line" value={current} />
    </div>
  );
}
