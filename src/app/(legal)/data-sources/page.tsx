import Link from "next/link";
import LegalDraftNote from "@/components/legal-draft-note";

export const metadata = { title: "Data sources" };

export default function DataSourcesPage() {
  return (
    <article>
      <h1>Where the Lead Finder&apos;s data comes from</h1>
      <p>Last updated: September 27, 2026</p>
      <LegalDraftNote updated="September 27, 2026" />

      <h2>The business&apos;s own website</h2>
      <p>
        Phone numbers, contact-form links and published business emails come from the
        business&apos;s own website: its home, contact, about and team pages. Every contact keeps a
        link to the page where we found it. We follow each site&apos;s robots.txt, name ourselves
        in every request, and wait between requests.
      </p>

      <h2>OpenStreetMap</h2>
      <p>
        We use OpenStreetMap to discover businesses and their websites. Map data © OpenStreetMap
        contributors, available under the Open Database License (ODbL):{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          openstreetmap.org/copyright
        </a>
        . Contacts we get from OpenStreetMap are marked as such.
      </p>

      <h2>Open government data</h2>
      <p>Public registers and open data published by governments, under their open licences.</p>

      <h2>What we never use</h2>
      <ul>
        <li>LinkedIn or other social networks behind a login</li>
        <li>Guessed email addresses (like first.last@)</li>
        <li>Home addresses</li>
        <li>Personal data that our users upload about their own customers</li>
      </ul>

      <h2>How we check</h2>
      <p>
        Emails: format, the domain&apos;s mail server, a throwaway-domain list, and that the email
        is still on their website. Phones: number format for the country, and that it is listed on
        their website. We never ask a mail server whether a mailbox exists. We check, we don&apos;t
        guarantee.
      </p>

      <h2>Remove your data</h2>
      <p>
        Is your business in our records and you&apos;d like it removed?{" "}
        <Link href="/remove-my-data">Remove my business data</Link>.
      </p>
    </article>
  );
}
