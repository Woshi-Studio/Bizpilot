import CopyBookingLink from "@/components/copy-booking-link";
import { REFERRAL_CREDITS } from "@/lib/referral";

// Settings -> Invite a business. The link, what it earns, and the counts.
export default function InviteSection({
  link,
  counts,
  owner,
}: {
  link: string;
  counts: { joined: number; rewarded: number } | null;
  owner: boolean;
}) {
  return (
    <section id="invite" className="card mt-8 scroll-mt-24 p-6">
      <h2 className="section-title">Invite a business → earn free leads</h2>
      <p className="mt-1 text-sm text-muted">
        Share your link. When a business you invite makes its first payment, you get{" "}
        <span className="font-semibold text-ink">{REFERRAL_CREDITS} free lead credits</span>. They never
        expire. One reward per business; your own accounts don&apos;t count.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <code className="min-w-0 max-w-full truncate rounded-lg border border-line/70 bg-surface-2 px-3 py-2 text-xs text-ink-2">
          {link}
        </code>
        <CopyBookingLink url={link} label="Copy my invite link" />
      </div>
      <p className="mt-3 text-sm text-ink-2">
        {counts
          ? `${counts.joined} joined from your link · ${counts.rewarded} reward${counts.rewarded === 1 ? "" : "s"} earned (${counts.rewarded * REFERRAL_CREDITS} credits)`
          : "Counts aren't available right now."}
      </p>
      {owner && <p className="mt-1 text-xs text-muted">Owner account: your lead credits are already unlimited.</p>}
    </section>
  );
}
