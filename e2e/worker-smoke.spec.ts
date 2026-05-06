import { test, expect } from "@playwright/test";

// Worker pages, mobile viewport (configured at the project level in
// playwright.config.ts via devices["Pixel 5"] — Chromium-based mobile).

const PAGES = [
  "/worker",
  "/worker/schedule",
  "/worker/leave",
  "/worker/account",
];

for (const path of PAGES) {
  test(`renders ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `HTTP status for ${path}`).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();
    expect(errors, `runtime errors on ${path}`).toEqual([]);
  });
}

test("worker home shows the bottom nav with three tabs", async ({ page }) => {
  await page.goto("/worker");
  // Exact match — without it, /Schedule/i also matches a job card whose
  // status pill reads "SCHEDULED", breaking strict-mode.
  await expect(page.getByRole("link", { name: "My Jobs", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Schedule", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Leave", exact: true })).toBeVisible();
});
