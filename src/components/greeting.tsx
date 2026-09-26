"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

// Morning / afternoon / evening in the VIEWER's time zone. The server
// runs on UTC, so it must not pick the greeting (that's how "Good
// morning" showed up at 10:51 pm). Before hydration it says "Hi".
export function greetingForHour(hour: number) {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function Greeting({ name }: { name: string }) {
  const hour = useSyncExternalStore(
    noopSubscribe,
    () => new Date().getHours(),
    () => -1
  );
  const text = hour < 0 ? "Hi" : greetingForHour(hour);
  return (
    <>
      {text}, {name}
    </>
  );
}
