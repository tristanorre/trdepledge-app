import { test, expect } from "@playwright/test";

// Page-render smoke check from inside an admin session. Catches stupid
// runtime errors (TypeErrors, missing imports, broken layouts) that
// scripts/smoke.mjs misses because it only checks HTTP status.

const PAGES = [
  "/admin",
  "/admin/jobs",
  "/admin/jobs/new",
  "/admin/enquiries",
  "/admin/schedule",
  "/admin/time",
  "/admin/hr",
  "/admin/hr/roster",
  "/admin/hr/leave",
  "/admin/hr/payroll",
  "/admin/inventory",
  "/admin/inventory/audit",
  "/admin/inventory/new",
  "/admin/clients",
  "/admin/clients/new",
  "/admin/costs",
  "/admin/account",
  "/admin/settings",
];

for (const path of PAGES) {
  test(`renders ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (res) => {
      if (res.status() >= 500 && res.url().includes("localhost")) {
        errors.push(`5xx: ${res.url()}`);
      }
    });

    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `HTTP status for ${path}`).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();
    expect(errors, `runtime errors on ${path}`).toEqual([]);
  });
}
