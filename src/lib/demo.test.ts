// Run: npm test   (node --test, no extra packages)
// Proves DEMO MODE can never switch on in production.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isDemoMode } from "./demo.ts";

test("demo mode is OFF in production even with DEMO_MODE=1", () => {
  assert.equal(isDemoMode({ NODE_ENV: "production", DEMO_MODE: "1" }), false);
});

test("demo mode is OFF when NODE_ENV is missing", () => {
  assert.equal(isDemoMode({ DEMO_MODE: "1" }), false);
});

test("demo mode is OFF in development without DEMO_MODE", () => {
  assert.equal(isDemoMode({ NODE_ENV: "development" }), false);
  assert.equal(isDemoMode({ NODE_ENV: "development", DEMO_MODE: "true" }), false);
  assert.equal(isDemoMode({ NODE_ENV: "development", DEMO_MODE: "0" }), false);
});

test("demo mode is ON only in development with DEMO_MODE=1", () => {
  assert.equal(isDemoMode({ NODE_ENV: "development", DEMO_MODE: "1" }), true);
  assert.equal(isDemoMode({ NODE_ENV: "test", DEMO_MODE: "1" }), true);
});

test("the demo Supabase client refuses to start outside demo mode", async () => {
  const saved = process.env.DEMO_MODE;
  delete process.env.DEMO_MODE;
  try {
    const { createDemoClient } = await import("./demo-client.ts");
    assert.throws(() => createDemoClient(), /outside DEMO MODE/);
  } finally {
    if (saved !== undefined) process.env.DEMO_MODE = saved;
  }
});

test("the production build replaces NODE_ENV, so the server gate is compiled off", async () => {
  // The gate reads process.env.NODE_ENV directly (not through a variable)
  // so Next.js inlines "production" at build time.
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("./demo.ts", import.meta.url), "utf8");
  assert.match(src, /process\.env\.NODE_ENV/);
  for (const file of ["./supabase/server.ts", "../proxy.ts"]) {
    const code = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(code, /if \(isDemoMode\(\)\)/, `${file} must gate demo on isDemoMode()`);
  }
});
