import { expect, test } from "@playwright/test";

test("fixture route is a guided 404 when its explicit development/test flag is absent", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_EXPECT_DEMO_UNAVAILABLE !== "true", "This probe runs only against the default-deny server.");
  for (const route of ["/pipeline/demo", "/pipeline/demo/packets/fixture%3Ahuman-gate-blocked"]) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(404);
    await expect(page.getByRole("heading", { name: "Demo packets are not available in the LAN cockpit." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open live pipeline" })).toHaveAttribute("href", "/pipeline");
    await expect(page.getByText("Demo fixtures", { exact: true })).toHaveCount(0);
  }
});
