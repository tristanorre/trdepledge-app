import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

// E2E suite for the field-service app.
//
// Required env (loaded from .env.local automatically by Next when the
// dev server starts):
//   - NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
//     SUPABASE_SERVICE_ROLE_KEY  → without these the API routes 503
//   - NEXTAUTH_SECRET, NEXTAUTH_URL → without these auth tests fail
//
// Tests assume a freshly-seeded database (migration 0009 applied):
//   - Thomas (admin) signs in with t.rdepledge@outlook.com / ChangeMe!2025
//   - Bradley Depledge (worker) signs in with PIN 1234
//
// If you've already rotated those credentials, override at run time:
//   E2E_ADMIN_PASSWORD=… E2E_WORKER_PIN=… npm run test:e2e
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,           // tests share the same DB; serialise to avoid cross-talk
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  globalSetup: "./e2e/global-setup.ts",

  projects: [
    {
      name: "anon",
      // Public site + login screens — no stored auth.
      use: { ...devices["Desktop Chrome"] },
      testMatch: /(?:public|auth)\.spec\.ts/,
    },
    {
      name: "admin",
      // Re-uses storage state created by global-setup.
      use: { ...devices["Desktop Chrome"], storageState: ".auth/admin.json" },
      testMatch: /admin-.*\.spec\.ts/,
      dependencies: ["anon"], // ensures auth flow proves itself first
    },
    {
      name: "mobile-worker",
      use: { ...devices["iPhone 13"], storageState: ".auth/worker.json" },
      testMatch: /worker-.*\.spec\.ts/,
      dependencies: ["anon"],
    },
  ],

  // Auto-start the dev server unless one is already running. CI starts
  // a fresh one each time and tears it down with the test process.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
