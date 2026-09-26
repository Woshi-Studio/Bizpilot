import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isDemoMode } from "@/lib/demo";

export async function createClient() {
  const cookieStore = await cookies();

  // DEMO MODE (dev only, DEMO_MODE=1): fake data, no login. isDemoMode()
  // is always false in a production build — see src/lib/demo.ts.
  if (isDemoMode()) {
    const { createDemoClient } = await import("@/lib/demo-client");
    return createDemoClient() as unknown as ReturnType<typeof realClient>;
  }

  return realClient(cookieStore);
}

function realClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component: cookie writes are not allowed
            // there. Safe to ignore because the proxy refreshes sessions.
          }
        },
      },
    }
  );
}
