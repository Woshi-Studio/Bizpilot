import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

// Only same-site paths: must start with one "/" and not "//" or "/\"
// (both of which browsers treat as another host). Anything else goes to
// the dashboard.
function safeNext(next: string | null): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\") ||
    /[\u0000-\u001f\u007f]/.test(next)
  ) {
    return "/dashboard";
  }
  return next;
}

// Only the link types Supabase emails actually send.
const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function otpType(raw: string | null): EmailOtpType | null {
  return OTP_TYPES.find((t) => t === raw) ?? null;
}

// Handles both PKCE code exchanges (?code=) and OTP verification links
// (?token_hash=&type=) from Supabase emails.
//
// Email change with "Secure email change" on: the user must click a link in
// BOTH inboxes. The first click is accepted but nothing changes yet — Supabase
// then sends ?message=... (PKCE) or verifyOtp returns no session (OTP). We
// send them back to Settings with a "now click the other one" note. The
// second click finishes the change.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = otpType(searchParams.get("type"));
  const next = safeNext(searchParams.get("next"));

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      if (type === "email_change") {
        const status = data.session ? "changed" : "partial";
        return NextResponse.redirect(`${origin}/settings?email=${status}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // First half of a two-inbox email change (PKCE flow): no code, just a
  // Supabase notice. Fixed same-site path — never taken from the query.
  if (!code && !tokenHash && searchParams.get("message")) {
    return NextResponse.redirect(`${origin}/settings?email=partial`);
  }

  return NextResponse.redirect(
    `${origin}/login?error=Could not verify your link. Please try again.`
  );
}
