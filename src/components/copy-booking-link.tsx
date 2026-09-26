"use client";

import Link from "next/link";
import { useState } from "react";
import Icon from "@/components/icons";

// "Copy my booking link". With no booking page yet, it links to
// Settings -> Booking instead.
export default function CopyBookingLink({
  url,
  className = "btn-secondary btn-sm",
  label = "Copy my booking link",
}: {
  url: string | null;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!url) {
    return (
      <Link href="/settings/booking" className={className}>
        <Icon name="calendar" className="h-4 w-4" />
        Set up my booking page
      </Link>
    );
  }
  return (
    <button
      type="button"
      title={url}
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          window.prompt("Copy your booking link:", url);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      <Icon name={copied ? "check" : "copy"} className="h-4 w-4" />
      {copied ? "Copied!" : label}
    </button>
  );
}
