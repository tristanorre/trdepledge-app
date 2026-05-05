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
  const adminCtx = await browser.newContext({ baseURL });
  const adminPage = await adminCtx.newPage();
  await adminPage.goto("/login");
  await adminPage.getByRole("tab", { name: "Admin" }).click();
  await adminPage.getByLabel("Email").fill(ADMIN_EMAIL);
  await adminPage.getByLabel("Password").fill(ADMIN_PASSWORD);
  await adminPage.getByRole("button", { name: /Sign in/i }).click();
  await adminPage.waitForURL(/\/admin(\?|$)/, { timeout: 30_000 });
  await adminCtx.storageState({ path: path.join(authDir, "admin.json") });
  await adminCtx.close();

  // ── Worker (Bradley) ────────────────────────────────────────────
  const workerCtx = await browser.newContext({ baseURL });
  const workerPage = await workerCtx.newPage();
  await workerPage.goto("/login");
  // Worker tab is the default — selectOption on the worker dropdown.
  await workerPage.getByLabel(/Who.+logging in/i).selectOption({ label: WORKER_NAME });
  await workerPage.getByLabel(/4-digit PIN/i).fill(WORKER_PIN);
  await workerPage.getByRole("button", { name: /Sign in/i }).click();
  await workerPage.waitForURL(/\/worker(\?|$)/, { timeout: 30_000 });
  await workerCtx.storageState({ path: path.join(authDir, "worker.json") });
  await workerCtx.close();

  await browser.close();
}
