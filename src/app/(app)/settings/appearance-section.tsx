import { ThemePicker } from "@/components/theme";
import { emailStatus, EMAIL_DAILY_LIMIT } from "@/lib/email";

// Settings > Appearance (light / dark / system) and the email-sending
// status. The theme choice is saved in this browser.
export default function AppearanceSection({ businessId }: { businessId?: string }) {
  const email = businessId ? emailStatus({ id: businessId }) : null;
  return (
    <div className="mt-8 grid gap-5 sm:grid-cols-2">
      <div className="card p-6">
        <h2 className="section-title">Appearance</h2>
        <p className="mt-1 text-sm text-muted">
          Light, dark, or follow your device. Saved on this browser.
        </p>
        <div className="mt-4">
          <ThemePicker />
        </div>
      </div>
      <div className="card p-6">
        <h2 className="section-title">Sending email</h2>
        {email?.canSend ? (
          <p className="mt-1 text-sm text-muted">
            <span className="font-medium text-green-600">On.</span> Send emails to your
            customers and leads right from Jephelen — up to {EMAIL_DAILY_LIMIT} a day.
            Every email shows on their timeline.
          </p>
        ) : email?.reason === "not_configured" ? (
          <p className="mt-1 text-sm text-muted">
            <span className="font-medium text-amber-600">Not set up.</span> Add
            EMAIL_PROVIDER and the SMTP_* settings on the server (see CLEAN-UI.md).
            Until then, messages have a Copy button.
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">
            <span className="font-medium text-ink">Coming soon.</span> For now, use
            Copy on any AI message and paste it into your own email.
          </p>
        )}
      </div>
    </div>
  );
}
