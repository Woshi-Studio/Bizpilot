# Account settings: change login email

Branch: `free-ai`. Settings page now has a "Login email" box. It shows the
current email and lets the user ask for a new one.

## How it works

1. User types a new email and clicks "Change login email".
2. Server action `changeEmail` in `src/app/(auth)/actions.ts` checks the
   format, checks it is not the same as the current email, then calls
   `supabase.auth.updateUser({ email }, { emailRedirectTo })`. The link goes
   to `/auth/callback`, which then sends the user to `/settings`.
3. User sees: "Check both inboxes. Click the confirm link in each to finish.
   You stay logged in with the old email until then."
4. `/auth/callback` accepts `type=email_change`. After the first link it
   shows "One link confirmed. Now click the confirm link in the other inbox
   to finish." After the second link it shows "Your login email is updated."
   The safe-redirect check on `next` is unchanged. The email-change redirects
   go to a fixed `/settings` path, never a path from the link.

## Why both inboxes: Supabase "Secure email change"

Supabase dashboard → Authentication → Providers → Email → **Secure email
change**. It is ON by default. When it is on:

- Supabase emails a confirm link to the OLD address AND the NEW address.
- The change only happens after BOTH links are clicked.
- Until then the user keeps logging in with the old email.

This stops someone who grabs an open session from moving the account to
their own email. Keep it on.

If it is turned OFF, only the new address gets a link, and one click
finishes the change. The code works either way.

## Email templates

The default "Change Email Address" template (`{{ .ConfirmationURL }}`) works
with no edits. If the template is changed to a token-hash link, point it at
`{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email_change`.

## Test it

1. Log in, open Settings, enter an email you can read.
2. Click the link in the old inbox → Settings says "One link confirmed".
3. Click the link in the new inbox → Settings says "updated" and shows the
   new email.
4. Try the same email again → "That is already your login email."
5. Try `abc` → "Please enter a valid email address."
