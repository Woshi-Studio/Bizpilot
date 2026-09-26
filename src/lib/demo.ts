// DEMO MODE — fake sample data, no login. For screenshots in development.
//
// On ONLY when BOTH are true:
//   - NODE_ENV is not "production" (`next dev`, never `next build/start`)
//   - DEMO_MODE=1 is set in the environment
//
// In a production build Next.js replaces process.env.NODE_ENV with the
// string "production" at build time, so this always returns false there,
// whatever DEMO_MODE says. See demo.test.ts.
//
// This file must stay free of path aliases and imports so the test can
// load it with plain `node --test`.

type Env = Record<string, string | undefined>;

export function isDemoMode(env: Env = process.env): boolean {
  const nodeEnv = env === process.env ? process.env.NODE_ENV : env.NODE_ENV;
  if (nodeEnv === "production") return false;
  if (!nodeEnv) return false; // unknown environment: stay off
  return env.DEMO_MODE === "1";
}

export const DEMO_USER_ID = "00000000-0000-4000-8000-00000000d3e0";
export const DEMO_BUSINESS_ID = "00000000-0000-4000-8000-0000000b0501";
