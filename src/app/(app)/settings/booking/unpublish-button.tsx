"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { unpublishBookingPage } from "./actions";

// Takes the page offline. The link name, hours and meeting types stay, so
// "Publish booking page" brings back the same link.
export default function UnpublishButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="shrink-0">
      <button
        type="button"
        disabled={pending}
        className="btn-ghost btn-sm text-red-600"
        onClick={() => {
          if (!confirm("Unpublish your booking page? The link stops working until you publish again. Bookings you already have stay.")) return;
          start(async () => {
            const res = await unpublishBookingPage();
            if (!res.ok) setError(res.error ?? "That didn't save. Please try again.");
            else router.refresh();
          });
        }}
      >
        {pending ? "Unpublishing…" : "Unpublish"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
