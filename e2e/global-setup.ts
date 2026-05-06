import { chromium, type FullConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Logs in once as admin and once as a worker (Bradley by default), then
// stores the session cookies under .auth/. Each test project re-uses the
// matching storage state so individual specs don't have to re-authenticate.
//
// Override the seeded creds via env if they've been rotated:
//   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_WORKER_NAME, E2E_WORKER_PIN
const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL    ?? "t.rdepledge@outlook.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "ChangeMe!2025";
const WORKER_NAME    = process.env.E2E_WORKER_NAME    ?? "Bradley Depledge";
const WORKER_PIN     = process.env.E2E_WORKER_PIN     ?? "1234";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL ?? "http://localhost:3000";
  const authDir = path.resolve(".auth");
  fs.mkdirSync(authDir, { recursive: true });

  const browser = await chromium.launch();

  // ── Admin ───────────────────────────────────────────────────────
  // Tolerant of login failure so the `anon` project still runs even
  // when Supabase isn't configured. The admin/mobile-worker projects
  // will see their own auth-required pages bounce to /login.
  await tryLogin({
    browser, baseURL, authDir, file: "admin.json",
    setup: async (page) => {
      await page.goto("/login");
      await page.getByRole("tab", { name: "Admin" }).click();
      await page.getByLabel("Email").fill(ADMIN_EMAIL);
      await page.getByLabel("Password").fill(ADMIN_PASSWORD);
      await page.getByRole("button", { name: /Sign in/i }).click();
      await page.waitForURL(/\/admin(\?|$)/, { timeout: 30_000 });
    },
  });

  // ── Worker (Bradley) ────────────────────────────────────────────
  await tryLogin({
    browser, baseURL, authDir, file: "worker.json",
    setup: async (page) => {
      await page.goto("/login");
      await page.getByLabel(/Who.+logging in/i).selectOption({ label: WORKER_NAME });
      await page.getByLabel(/4-digit PIN/i).fill(WORKER_PIN);
      await page.getByRole("button", { name: /Sign in/i }).click();
      await page.waitForURL(/\/worker(\?|$)/, { timeout: 30_000 });
    },
  });

  await browser.close();
}

async function tryLogin(opts: {
  browser: Awaited<ReturnType<typeof chromium.launch>>;
  baseURL: string;
  authDir: string;
  file: string;
  setup: (page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newContext"]>>["newPage"] extends () => Promise<infer P> ? P : never) => Promise<void>;
}): Promise<void> {
  const ctx = await opts.browser.newContext({ baseURL: opts.baseURL });
  const page = await ctx.newPage();
  try {
    await opts.setup(page);
    await ctx.storageState({ path: path.join(opts.authDir, opts.file) });
    console.log(`[global-setup] saved ${opts.file}`);
  } catch (err) {
    console.warn(
      `[global-setup] could not log in for ${opts.file} — writing empty storage state. ` +
      `Specs that require this auth will fail. Reason: ${(err as Error).message?.split("\n")[0]}`
    );
    // Write an empty storage-state stub so Playwright doesn't crash on
    // `storageState: ".auth/admin.json"` for projects that depend on it.
    fs.writeFileSync(
      path.join(opts.authDir, opts.file),
      JSON.stringify({ cookies: [], origins: [] }),
    );
  } finally {
    await ctx.close();
  }
}
