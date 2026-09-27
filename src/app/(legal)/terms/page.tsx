import Link from "next/link";
import LegalDraftNote from "@/components/legal-draft-note";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <article>
      <h1>Terms of Service</h1>
      <p>Last updated: September 27, 2026</p>
      <LegalDraftNote updated="September 27, 2026" />

      <h2>1. Who we are</h2>
      <p>
        Jephelen is a business tool for freelancers and small businesses: customer records, tasks,
        money tracking, invoices, a booking page, writing help and the Lead Finder. It is run by
        Woshi Studio in Mississauga, Ontario, Canada (&quot;we&quot;, &quot;us&quot;). By
        creating an account you agree to these terms.
      </p>

      <h2>2. Plans and billing</h2>
      <p>
        Paid plans renew every 4 weeks and are charged in US dollars through Stripe until you
        cancel. You can cancel any time in Settings; the plan then runs to the end of the period
        you paid for. Prices are shown in Settings before you pay. We don&apos;t give partial
        refunds for unused time unless the law requires it.
      </p>

      <h2>3. Credits</h2>
      <ul>
        <li>A Lead Finder credit pays for one company delivered with at least one contact.</li>
        <li>
          When a search needs research, we hold a credit. If we find nothing, the credit comes
          back: not found is free.
        </li>
        <li>Credits have no cash value, can&apos;t be sold or moved to another account, and end when the account closes.</li>
      </ul>

      <h2>4. The Lead Finder</h2>
      <p>
        The Lead Finder looks up businesses one request at a time. It uses public sources only: the
        business&apos;s own website, OpenStreetMap and open government data (see{" "}
        <Link href="/data-sources">Data sources</Link>). A result within 24 hours is a target, not
        a promise. Anything not ready by then is finished for free.
      </p>

      <h2>5. Accuracy: we check, we don&apos;t guarantee</h2>
      <p>
        We check each email&apos;s format and mail server and that it is still on the
        business&apos;s website, and each phone number&apos;s format and that it is listed on
        their website. We can&apos;t promise that an email will be delivered or that a number is in
        service. If an email bounces or a number is wrong, report it on the result within 30 days.
        The credit comes back automatically while your refunds stay within 20% of the credits you
        used in the last 90 days; above that, we review it by hand. Bad contacts are removed for
        everyone.
      </p>

      <h2>6. Your duties when you contact leads</h2>
      <p>
        You are responsible for every message and call you make. Follow the laws where you and they
        are, including Canada&apos;s Anti-Spam Legislation (CASL) and the CRTC telemarketing and
        Do Not Call rules, the US CAN-SPAM Act and TCPA, and the GDPR / UK GDPR. In short: say who
        you are, give a way to say no, honour it within 10 business days, and only send messages
        that are relevant to the person&apos;s work.
      </p>

      <h2>7. Acceptable Use</h2>
      <p>
        The <Link href="/acceptable-use">Acceptable Use rules</Link> are part of these terms. You
        accept them before your first Lead Finder search.
      </p>

      <h2>8. What we keep</h2>
      <p>
        Company-level results we find on public sources (a company&apos;s name, website, phone,
        contact form and published business email) go into our shared records, with their source,
        so the next search is faster. Personal data you upload or type about your own customers and
        contacts is never added to those shared records.
      </p>

      <h2>9. Your licence to use leads</h2>
      <p>
        You may use leads to contact businesses for your own business. You may not resell, share or
        publish them as lists, or use them to build a competing database.
      </p>

      <h2>10. Suspension</h2>
      <p>
        We may suspend or close an account that breaks these terms or the Acceptable Use rules, or
        that gets repeated spam complaints. Unused credits on a suspended account are lost.
      </p>

      <h2>11. Disclaimers, liability and indemnity</h2>
      <p>
        Jephelen is provided &quot;as is&quot;. Its suggestions, drafts and results, including
        writing help and business, tax or legal pointers, are not professional advice; check them
        before you rely on them, and keep your own copies of important documents. To the extent the
        law allows, our total liability is limited to the fees you paid us in the 3 months before
        the claim, and we are not liable for indirect or lost-profit damages. You agree to cover our
        costs if a claim against us comes from the way you used leads or sent messages.
      </p>

      <h2>12. Law</h2>
      <p>
        These terms are governed by the laws of Ontario and the federal laws of Canada that apply
        there. Disputes go to the courts of Ontario.
      </p>

      <h2>13. Changes to these terms</h2>
      <p>
        We may update these terms as Jephelen changes. We&apos;ll announce meaningful changes
        inside the app before they take effect. Your data stays yours: you can export or delete it
        at any time.
      </p>
    </article>
  );
}
