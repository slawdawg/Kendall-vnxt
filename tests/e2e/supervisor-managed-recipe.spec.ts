import { expect, test } from "@playwright/test";

async function openHomeWithTemplate(page) {
  const templateButton = page.getByRole("button", { name: "Expand dashboard coverage" });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    try {
      await templateButton.waitFor({ state: "visible", timeout: 5000 });
      return templateButton;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await page.waitForTimeout(500);
    }
  }
  return templateButton;
}

test.describe("supervisor-managed dashboard recipe", () => {
  test("keeps dashboard coverage intake available for managed work", async ({ page }) => {
    test.setTimeout(60000);

    const templateButton = await openHomeWithTemplate(page);
    await templateButton.click();
    await expect(page.getByLabel("3. Describe the result you need")).toHaveValue(
      "Expand focused dashboard coverage for the named workflow and leave the repo green after browser and shared checks.",
    );
    await expect(page.getByText("Template: Expand dashboard coverage")).toBeVisible();
    await expect(page.getByText("Source: operator-dashboard:improvement")).toBeVisible();
  });
});
