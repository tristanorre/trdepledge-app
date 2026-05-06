import { test, expect } from "@playwright/test";

// Admin job CRUD smoke test. Uses the admin storage state from global-setup.
//
// Each run creates a job tagged with a unique marker so cleanup can
// find it (and so concurrent runs don't fight over one record). Test
// deletes the job at the end — failures still leak a row, but the
// `[E2E]` prefix makes it easy to clean up by hand or via SQL.

const MARKER_PREFIX = "[E2E]";

test.describe("Admin jobs", () => {
  test("create → see in list → edit → delete", async ({ page }) => {
    const stamp = Date.now();
    const clientName = `${MARKER_PREFIX} Test Client ${stamp}`;

    // ── Create ───────────────────────────────────────────────────
    await page.goto("/admin/jobs/new");
    await page.getByLabel(/Client name/i).fill(clientName);
    await page.getByLabel(/Client type/i).selectOption("Private");
    await page.getByLabel(/Suburb/i).fill("Wallaroo");
    await page.getByLabel(/Description/i).fill(`E2E test · ${stamp}`);

    await page.getByRole("button", { name: /Create job/i }).click();

    // We land on the detail page after creation.
    await page.waitForURL(/\/admin\/jobs\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: clientName })).toBeVisible();

    const detailUrl = page.url();
    const jobId = detailUrl.split("/").pop()!;

    // ── List ─────────────────────────────────────────────────────
    await page.goto("/admin/jobs");
    await expect(page.getByText(clientName)).toBeVisible();

    // ── Edit (status flip via the form) ─────────────────────────
    await page.goto(`/admin/jobs/${jobId}/edit`);
    await page.getByLabel(/^Status$/).selectOption("completed");
    await page.getByRole("button", { name: /Save changes/i }).click();
    await page.waitForURL(detailUrl, { timeout: 30_000 });
    // Defensive reload — the App Router cache can briefly serve stale
    // RSC payloads after navigate-back-to-recently-visited-URL even
    // with the API-route revalidatePath we now do server-side. Test
    // is more reliable when it requests a fresh render.
    await page.reload();
    // Wait specifically for the Reopen button (only renders when
    // status === "completed"); avoids racing against the dropdown's
    // "Completed" option label that lingers from the edit page.
    await expect(page.getByRole("button", { name: /Reopen job/i })).toBeVisible({ timeout: 15_000 });

    // ── Reopen (the small admin gap-closer we built earlier) ─────
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Reopen job/i }).click();
    await page.reload();
    await expect(page.getByRole("link", { name: /Edit job/i })).toBeVisible({ timeout: 15_000 });

    // ── Delete ───────────────────────────────────────────────────
    await page.goto(`/admin/jobs/${jobId}/edit`);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /^Delete$/i }).click();
    await page.waitForURL(/\/admin\/jobs(\?|$)/, { timeout: 30_000 });
    await expect(page.getByText(clientName)).toHaveCount(0);
  });
});
