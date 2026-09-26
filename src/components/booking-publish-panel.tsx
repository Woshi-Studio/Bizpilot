import BookingLinkBox from "@/components/booking-link-box";
import PublishBookingButton from "@/components/publish-booking-button";
import type { MyBookingState } from "@/lib/booking-server";

// Top of Calendar and Settings → Booking.
//   Not live yet -> the big "Publish booking page" button.
//   Live         -> "Your booking link: <url> [Copy] [Open]".
export default function BookingPublishPanel({ state, children }: { state: MyBookingState; children?: React.ReactNode }) {
  if (state.missing) return null; // 0018 not run: the page shows its own warning
  if (!state.url) {
    const note =
      state.enabled && state.liveTypes === 0
        ? "Your page is switched on but has no meeting type, so visitors see “not available”. Publish fixes it in one click."
        : null;
    return <PublishBookingButton note={note} />;
  }
  return (
    <div className="card flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
      <p className="shrink-0 text-sm font-semibold text-ink">
        <span aria-hidden>🟢</span> Your booking link:
      </p>
      <BookingLinkBox url={state.url} />
      {children}
    </div>
  );
}
