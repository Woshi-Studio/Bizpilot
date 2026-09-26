"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

// Shows a timestamp in the viewer's own time zone. The server (and the
// hydration pass) render it in UTC; right after hydration React re-renders
// it in the browser's zone.
export default function LocalTime({
  iso,
  mode = "datetime",
}: {
  iso: string;
  mode?: "datetime" | "date" | "time";
}) {
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
  const d = new Date(iso);
  const timeZone = isClient ? undefined : "UTC";
  const text =
    mode === "date"
      ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone })
      : mode === "time"
        ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone })
        : d.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZone,
          });
  return <time dateTime={iso}>{text}</time>;
}
