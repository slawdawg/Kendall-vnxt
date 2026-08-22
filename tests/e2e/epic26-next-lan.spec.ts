import { expect, test } from "@playwright/test";
// @ts-expect-error The harness is intentionally test-only ESM JavaScript.
import { startEpic26NextLanHarness } from "./epic26-next-lan-harness.mjs";

test.describe("Epic 26 real Next LAN pipeline path", () => {
  test.use({ ignoreHTTPSErrors: true });
  let harness: Awaited<ReturnType<typeof startEpic26NextLanHarness>>;
  test.beforeAll(async () => { harness = await startEpic26NextLanHarness(3103); });
  test.afterAll(async () => { if (harness) await harness.close(); });

  test("authenticated pipeline and Packet Detail use the real Next routes and boundaries", async ({ page }) => {
    const supervisorRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/supervisor/")) supervisorRequests.push(new URL(request.url()).pathname);
    });
    await page.goto(`${harness.origin}/pipeline`);
    await expect(page.getByRole("heading", { name: "Secure operator access" })).toBeVisible();
    await page.getByLabel("Operator password").fill("test-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(page.locator("body")).toContainText("Pipeline");
    await page.waitForTimeout(1500);
    await page.evaluate(() => fetch("/api/supervisor/pipeline-control-plane/work-packets", { credentials: "same-origin" }));
    expect(supervisorRequests).toEqual(expect.arrayContaining(["/api/supervisor/pipeline-control-plane/projection", "/api/supervisor/pipeline-control-plane/work-packets"]));

    await page.goto(`${harness.origin}/pipeline/packets/packet-1`);
    await expect(page.getByRole("heading", { name: "Packet detail: Packet 1 detail" })).toBeVisible();
    await expect(page.getByText("Authenticated Packet Detail")).toBeVisible();
    await expect(page.getByText("hold")).toBeVisible();
  });
});
