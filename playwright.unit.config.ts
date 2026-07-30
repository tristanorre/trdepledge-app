import { defineConfig } from "@playwright/test";

// Unit tests for pure server-side logic — currently the DIY Hire
// availability engine.
//
// Separate from playwright.config.ts on purpose: the e2e config starts a
// dev server and runs a global setup that signs in against a seeded
// database. These tests touch neither, so they run anywhere in about a
// second — including on a machine with no Supabase credentials.
//
// We reuse @playwright/test rather than adding a second test runner: it's
// already a devDependency, it transpiles TypeScript and resolves the `@/*`
// tsconfig paths without extra configuration.
//
//   npm run test:unit
export default defineConfig({
  testDir: "./unit",
  fullyParallel: true,
  reporter: [["list"]],
  // No `use.browserName`, no webServer, no globalSetup — nothing here
  // opens a browser.
});
