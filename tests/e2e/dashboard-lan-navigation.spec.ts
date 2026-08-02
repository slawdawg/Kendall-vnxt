import { expect, test } from "@playwright/test";
// @ts-expect-error Test-only LAN harness is JavaScript.
import { startEpic26NextLanHarness } from "./epic26-next-lan-harness.mjs";

test.describe("authenticated LAN dashboard route matrix", () => {
  test.use({ ignoreHTTPSErrors: true });
  let harness: Awaited<ReturnType<typeof startEpic26NextLanHarness>>;
  test.beforeAll(async () => { harness = await startEpic26NextLanHarness(3104); });
  test.afterAll(async () => { if (harness) await harness.close(); });

  async function signIn(page: import("@playwright/test").Page, account: "operator" | "test_viewer" = "operator") {
    await page.goto(`${harness.origin}/pipeline`);
    await page.getByLabel("Account").selectOption(account);
    await page.getByLabel("Password").fill("test-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  }

  async function installEmptyReadMatrix(page: import("@playwright/test").Page) {
    await page.route("**/api/supervisor/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
    });
  }

  test("operator pages complete authenticated reads without SSR failure or indefinite loading", async ({ page }) => {
    await installEmptyReadMatrix(page);
    await signIn(page);
    for (const [pathname, heading] of [
      ["/active-work", "In-flight implementation and review"],
      ["/attention", "Needs-attention queue"],
      ["/queue", "Queue and lane backlog"],
      ["/audit", "Audit backlog and completion trail"],
      ["/proposed-work", "No proposed work yet"],
    ]) {
      await page.goto(`${harness.origin}${pathname}`);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await expect(page.getByText("Dashboard data unavailable")).toHaveCount(0);
      await expect(page.getByText("Reading authenticated supervisor data")).toHaveCount(0);
    }
  });

  test("missing work item is an authenticated not-found state", async ({ page }) => {
    await page.route("**/api/supervisor/work-items/missing-item", async (route) => {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ state: "unavailable" }) });
    });
    await signIn(page);
    await page.goto(`${harness.origin}/work-items/missing-item`);
    await expect(page.getByRole("heading", { name: "Record not found" })).toBeVisible();
  });

  test("test viewer navigation exposes only the pipeline surface", async ({ page }) => {
    await signIn(page, "test_viewer");
    await page.goto(`${harness.origin}/pipeline`);
    await page.locator("summary").click();
    await expect(page.getByRole("link", { name: "Pipeline" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Controls" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Active Work" })).toHaveCount(0);
    await expect(page.getByLabel("Contextual action strip")).toHaveCount(0);
    const denied = await page.goto(`${harness.origin}/active-work`);
    expect(denied?.status()).toBe(404);
  });
});
