import { expect, test } from "@playwright/test";
// @ts-expect-error The harness is intentionally test-only ESM JavaScript.
import { startEpic26AuthHarness } from "./epic26-auth-harness.mjs";

test.describe("Epic 26 authenticated LAN UX", () => {
  test.use({ baseURL: "https://127.0.0.1:3102", ignoreHTTPSErrors: true });
  let harness: Awaited<ReturnType<typeof startEpic26AuthHarness>>;
  test.beforeAll(async () => { harness = await startEpic26AuthHarness(3102); });
  test.afterAll(async () => { await harness.close(); });

  test("unauthenticated protected visit renders only secure sign-in with no packet leakage", async ({ page }) => {
    await page.goto("/pipeline");
    await expect(page.getByRole("heading", { name: "Secure operator access" })).toBeVisible();
    await expect(page.getByLabel("Operator password")).toBeFocused();
    await expect(page.locator("body")).not.toContainText(/packet|receipt|attestation/i);
  });

  test("generic failure keeps protected state out of the DOM", async ({ page }) => {
    page.on("pageerror", (error) => console.error(`EPIC26_PAGE_ERROR:${error.message}`));
    await page.goto("/pipeline");
    await page.getByLabel("Operator password").fill("intentionally-invalid");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toHaveText("Sign-in unavailable. Check credentials or try again later.");
    await expect(page.locator("body")).not.toContainText(/packet|receipt|attestation/i);
  });

  test("successful login reads detail, logs out, and clears stale detail", async ({ page }) => {
    await page.goto("/pipeline");
    await page.getByLabel("Operator password").fill("test-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Kendall Supervisor" })).toBeVisible();
    await page.getByRole("button", { name: "Open Packet Detail" }).click();
    await expect(page.locator("#detail-view")).toContainText("Packet 1 detail");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Secure operator access" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Packet 1 detail");
  });
});
