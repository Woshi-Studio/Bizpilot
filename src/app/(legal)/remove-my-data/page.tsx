import Link from "next/link";
import RemovalForm from "./removal-form";

export const metadata = { title: "Remove my business data" };

export default function RemoveMyDataPage() {
  return (
    <article>
      <h1>Remove my business data</h1>
      <p>
        Jephelen&apos;s Lead Finder keeps public business contacts (like a company phone number,
        website or contact form) so our users can reach businesses that fit what they sell. See{" "}
        <Link href="/data-sources">where the data comes from</Link>.
      </p>
      <p>
        Want your data out? Fill in what you&apos;d like removed. We email you a link; when you
        press Confirm, we delete it from our records at once and add it to our do-not-collect list,
        so it isn&apos;t collected again. It&apos;s free, and you don&apos;t need an account.
      </p>
      <RemovalForm />
      <p className="mt-4 text-xs text-slate-500">
        We use your email only for this request, and keep a record of the request to show we
        honoured it. Results already delivered to a user before your request stay in that
        user&apos;s own account; they can&apos;t get fresh copies from us. Questions or a complaint:
        see our <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </article>
  );
}
