import Link from "next/link";
import ConfirmForm from "./confirm-form";

export const metadata = { title: "Confirm removal", robots: { index: false } };

export default async function ConfirmRemovalPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const token = typeof t === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(t) ? t : null;

  return (
    <article>
      <h1>Confirm removal</h1>
      {token ? (
        <>
          <p>
            Press the button to remove the business data you asked about from Jephelen&apos;s Lead
            Finder records. It happens straight away and can&apos;t be undone.
          </p>
          <ConfirmForm token={token} />
        </>
      ) : (
        <p>
          This link isn&apos;t complete. Open the link from your email again, or{" "}
          <Link href="/remove-my-data">send a new request</Link>.
        </p>
      )}
    </article>
  );
}
