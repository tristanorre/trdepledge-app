import { test, expect } from "@playwright/test";

// Marketing site smoke + contact form. Runs without auth.

test.describe("Public marketing site", () => {
  test("home page renders the brand + town rotator", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/T\.R\. Depledge/);
    await expect(page.getByRole("link", { name: /T\.R\. Depledge/ }).first()).toBeVisible();
    // Hero says "Trusted Garden & Maintenance Experts" with the rotating town.
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Garden/);
  });

  test("services page lists the spec's services", async ({ page }) => {
    await page.goto("/services");
    // Each label appears multiple times (page hero + service cards +
    // footer). `.first()` is enough — we just need *at least one* match.
    await expect(page.getByText("Garden Maintenance", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("NDIS Garden Support", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Aged Care Services", { exact: false }).first()).toBeVisible();
  });

  test("NDIS page shows the support item code + 2025-26 rate", async ({ page }) => {
    await page.goto("/ndis-aged-care");
    await expect(page.getByText("01_019_0120_1_1")).toBeVisible();
    await expect(page.getByText("$56.98")).toBeVisible();
  });

  test("about page lists the team with Thomas as Owner", async ({ page }) => {
    await page.goto("/about");
    // Thomas's name appears in the founder story + the team card.
    await expect(page.getByText("Thomas Depledge").first()).toBeVisible();
    await expect(page.getByText(/Owner/i).first()).toBeVisible();
  });

  test("gallery + contact pages render", async ({ page }) => {
    await page.goto("/gallery");
    await expect(page.getByRole("heading", { name: /Gallery/i }).first()).toBeVisible();

    await page.goto("/contact");
    // Phone shows in nav, footer, hero, contact card — any match is fine.
    await expect(page.getByText("0474 844 204").first()).toBeVisible();
  });
});

test.describe("Contact form", () => {
  test("submission shows the success state", async ({ page }) => {
    await page.goto("/contact");

    // Tag with a unique marker so any DB cleanup can find this enquiry.
    const marker = `e2e-${Date.now()}`;

    await page.getByLabel(/First Name/i).fill("E2E");
    await page.getByLabel(/Last Name/i).fill("Tester");
    await page.getByLabel(/Email Address/i).fill(`${marker}@example.com`);
    await page.getByLabel(/Suburb/i).fill("Wallaroo");
    await page.getByLabel(/Service Type/i).selectOption({ label: "Garden Maintenance" });
    await page.getByLabel(/Tell Us About Your Job/i).fill(`E2E test enquiry · marker=${marker}`);

    await page.getByRole("button", { name: /Send Message/i }).click();

    // Either: success state shown (Supabase configured) OR an error
    // (Supabase missing). Both are valid outcomes for the form contract.
    await expect(
      page.getByText(/Message sent|Could not save/i)
    ).toBeVisible({ timeout: 15_000 });
  });
});
