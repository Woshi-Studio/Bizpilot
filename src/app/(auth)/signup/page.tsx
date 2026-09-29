import SignupForm from "./signup-form";

// /signup?ref=<code>: an invite link from another business (src/lib/referral.ts).
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string | string[] }>;
}) {
  const ref = (await searchParams).ref;
  const code = typeof ref === "string" && /^[A-Za-z0-9_-]{22}$/.test(ref) ? ref : null;
  return <SignupForm refCode={code} />;
}
