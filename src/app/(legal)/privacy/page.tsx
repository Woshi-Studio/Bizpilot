import Link from "next/link";
import LegalDraftNote from "@/components/legal-draft-note";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <article>
      <h1>Privacy Policy</h1>
      <p>Last updated: September 27, 2026</p>
      <LegalDraftNote updated="September 27, 2026" />

      <h2>1. Who we are</h2>
      <p>
        Jephelen is run by Woshi Studio in Mississauga, Ontario, Canada. For privacy questions or
        requests, use the feedback button inside the app, or the form on{" "}
        <Link href="/remove-my-data">Remove my business data</Link>.
      </p>

      <h2>2. Your data as a user</h2>
      <ul>
        <li>Account: your name, email and login details.</li>
        <li>Billing: handled by Stripe. We keep your plan and a Stripe customer id, never your card number.</li>
        <li>Your business data: customers, leads, tasks, money, invoices, files and notes you choose to store.</li>
        <li>Usage: what features you use and how much (for limits and fixing problems).</li>
        <li>Lead Finder: your intake answers (your business, offer, target customer, area) and your search history.</li>
      </ul>
      <p>
        We keep it while your account is open. When you delete your account, we delete it within 30
        days, except billing records the law says we must keep.
      </p>

      <h2>3. Business contact data we find (the Lead Finder)</h2>
      <ul>
        <li>
          Sources: the business&apos;s own website, OpenStreetMap and open government data. Every
          contact keeps a link to where we found it.
        </li>
        <li>
          What we never collect: anything from LinkedIn, home addresses, guessed email addresses,
          and anything behind a login. Emails only when the business publishes them on its own
          website. We don&apos;t ask mail servers whether a mailbox exists.
        </li>
        <li>
          People: a search for a person only works at the company they work for, and only finds
          them where that company lists them as a business contact on its own website. We never
          search personal social media or people-finder sites, and we don&apos;t keep people&apos;s
          names in our shared records.
        </li>
        <li>
          Legal basis: business contact information used to reach people about their work. For
          Quebec, the EU and the UK we keep company-level contacts only (like info@).
        </li>
        <li>How long: 12 months after we last checked it, unless we check it again.</li>
        <li>
          Removal: any business or person can ask us to remove their data on{" "}
          <Link href="/remove-my-data">Remove my business data</Link>. We delete it and add it to a
          do-not-collect list so it doesn&apos;t come back.
        </li>
      </ul>

      <h2>4. How searches make the service better</h2>
      <p>
        When we find a company for one user, we keep the company-level result so the next person
        who asks gets it faster. We never add the personal data you upload or type about your own
        customers to these shared records.
      </p>

      <h2>5. Who else handles data</h2>
      <p>
        Supabase (database and file storage), Vercel (hosting), Stripe (payments), our email
        provider (sending emails you ask us to send) and the AI provider behind the writing help
        (the relevant piece of text, only to produce your result, not to train public models). Data
        may be stored and processed outside Canada, including in the United States. We don&apos;t
        sell your data or share it with advertisers.
      </p>

      <h2>6. Your rights and complaints</h2>
      <p>
        You can ask to see, correct or delete your personal information, and to withdraw consent.
        We answer within 30 days. If you&apos;re not happy with our answer, you can complain to the
        Office of the Privacy Commissioner of Canada (priv.gc.ca).
      </p>

      <h2>7. Security</h2>
      <p>
        Your data is protected so only your account can read it. Keys and passwords are stored as
        hashes, connections are encrypted, and access to the shared records is limited to our
        servers.
      </p>

      <h2>8. Cookies</h2>
      <p>We use cookies only to keep you logged in and remember your theme. No tracking cookies, no ad networks.</p>

      <h2>9. Under 18</h2>
      <p>Jephelen is for businesses and is not meant for anyone under 18.</p>

      <h2>10. Changes</h2>
      <p>If this policy changes in a meaningful way, we&apos;ll announce it inside the app before it takes effect.</p>
    </article>
  );
}
