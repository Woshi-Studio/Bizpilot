import Link from "next/link";
import LegalDraftNote from "@/components/legal-draft-note";
import { AUP_VERSION } from "@/lib/finder";

export const metadata = { title: "Acceptable Use" };

export default function AcceptableUsePage() {
  return (
    <article>
      <h1>Acceptable Use</h1>
      <p>Version {AUP_VERSION}</p>
      <LegalDraftNote updated="September 27, 2026" />

      <p>
        These rules apply to everything in Jephelen, and most of all to the Lead Finder. You accept
        them before your first search. They are part of our <Link href="/terms">Terms</Link>.
      </p>

      <h2>1. One-to-one, relevant messages only</h2>
      <p>
        Write to one business at a time, about something that fits their work. No bulk blasting, no
        mass mail-merge, no automated sequences to people who never answered.
      </p>

      <h2>2. Say who you are, and let them say no</h2>
      <p>
        Every message names you and your business, gives a way to reach you (a mailing address plus
        an email, phone or website), and offers an easy way to opt out. Honour an opt-out within 10
        business days, and don&apos;t contact that person again.
      </p>

      <h2>3. Respect &quot;no solicitation&quot;</h2>
      <p>
        If a business says on its website that it doesn&apos;t want sales messages, don&apos;t send
        any. Respect Do Not Call lists for phone calls.
      </p>

      <h2>4. No reselling, no scraping</h2>
      <p>
        Don&apos;t resell, share or publish lists of leads. Don&apos;t scrape Jephelen or use it to
        build another database.
      </p>

      <h2>5. Business contacts only, never people-searching</h2>
      <p>
        You can look up a person only at the business they work for, and we only find them where
        that business lists them as a contact on its own website. Don&apos;t use the Lead Finder to
        find someone&apos;s personal details, home address or private accounts. We never search
        personal social media or people-finder sites.
      </p>

      <h2>6. No harassment or fraud</h2>
      <p>
        No threats, no misleading claims, no pretending to be someone else, and nothing illegal.
      </p>

      <h2>7. What happens if the rules are broken</h2>
      <p>
        We may suspend the account, and unused credits are lost. Repeated spam complaints about an
        account lead to suspension.
      </p>
    </article>
  );
}
