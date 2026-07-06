export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <article>
      <h1>Privacy Policy</h1>
      <p>Last updated: July 2026</p>

      <h2>1. What we collect</h2>
      <p>
        Your account details (name, email), and the business data you choose
        to store: customers, tasks, transactions, receipts, invoices, notes,
        and decisions. We don&apos;t collect more than the app needs to work.
      </p>

      <h2>2. Where it lives</h2>
      <p>
        Your data is stored with Supabase (our database and file-storage
        provider) and protected so that only your account can read it. We do
        not sell your data or share it with advertisers. Ever.
      </p>

      <h2>3. AI processing</h2>
      <p>
        When you use AI features, the relevant pieces of your data (for
        example, a customer&apos;s name and your notes when writing them a
        message) are sent to Anthropic&apos;s Claude API to generate the
        result. This data is used to produce your output, not to train public
        models.
      </p>

      <h2>4. Cookies</h2>
      <p>
        We use cookies only to keep you logged in. No tracking cookies, no ad
        networks.
      </p>

      <h2>5. Deleting your data</h2>
      <p>
        Delete individual records anytime in the app. To delete your entire
        account and everything in it, use the feedback button or contact us,
        and it will be removed.
      </p>

      <h2>6. Changes</h2>
      <p>
        If this policy changes in a meaningful way, we&apos;ll announce it
        inside the app before it takes effect.
      </p>
    </article>
  );
}
