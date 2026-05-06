import { test, expect } from "@playwright/test";

// Auth flows. Don't reuse the storage-state auth — these tests are
// the proof that the login flow works in the first place.

test.describe("Login screen", () => {
  test("admin tab → wrong password shows an error", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("tab", { name: "Admin" }).click();
    await page.getByLabel("Email").fill("t.rdepledge@outlook.com");
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: /Sign in/i }).click();
    await expect(page.getByText(/not recognised/i)).toBeVisible({ timeout: 15_000 });
  });

  test("worker tab → wrong PIN shows an error", async ({ page }) => {
    await page.goto("/login");
    // Worker tab is default. Pick the first worker in the dropdown.
    await page.getByLabel(/Who.+logging in/i).selectOption({ index: 1 });
    await page.getByLabel(/4-digit PIN/i).fill("0000");
    await page.getByRole("button", { name: /Sign in/i }).click();
    await expect(page.getByText(/not recognised/i)).toBeVisible({ timeout: 15_000 });
  });
});

// These two run after the wrong-creds tests so we don't pollute storage
// state. They exercise the same login that global-setup uses, but as
// explicit checks so failures are pinpointed instead of cascading.
test.describe("Successful sign-in", () => {
  test("admin lands on /admin", async ({ page }) => {
    // Admin password rotates out of the seed default immediately on
    // first deploy, and getting the wrong password 5× trips the
    // lockout from migration 0011. So this test only runs when an
    // explicit E2E_ADMIN_PASSWORD is provided.
    test.skip(!process.env.E2E_ADMIN_PASSWORD,
      "set E2E_ADMIN_PASSWORD to your current admin password to enable this test");

    await page.goto("/login");
    await page.getByRole("tab", { name: "Admin" }).click();
    await page.getByLabel("Email").fill(process.env.E2E_ADMIN_EMAIL    ?? "t.rdepledge@outlook.com");
    await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD!);
    await page.getByRole("button", { name: /Sign in/i }).click();
    await page.waitForURL(/\/admin(\?|$)/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  });

  test("worker lands on /worker", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/Who.+logging in/i).selectOption({ label: process.env.E2E_WORKER_NAME ?? "Bradley Depledge" });
    await page.getByLabel(/4-digit PIN/i).fill(process.env.E2E_WORKER_PIN ?? "1234");
    await page.getByRole("button", { name: /Sign in/i }).click();
    await page.waitForURL(/\/worker(\?|$)/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Hi / })).toBeVisible();
  });
});
