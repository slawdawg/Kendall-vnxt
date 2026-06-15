import { expect, test, devices } from "@playwright/test";

test.use(devices["Pixel 5"]);

async function openControlsWithTemplate(page) {
  const templateButton = page.getByRole("button", { name: "Harden mobile dashboard" });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/controls", { waitUntil: "domcontentloaded" });
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

test.describe("supervisor-managed mobile dashboard recipe", () => {
  test("keeps mobile coverage intake available for managed work", async ({ page }) => {
    test.setTimeout(60000);

    const templateButton = await openControlsWithTemplate(page);
    await templateButton.click();
    await expect(page.getByLabel("3. Describe the result you need")).toHaveValue(
      "Expand focused mobile dashboard coverage for the named workflow and leave the repo green after browser and shared checks.",
    );
    await expect(page.getByText("Template: Harden mobile dashboard")).toBeVisible();
    await expect(page.getByText("Source: operator-dashboard:improvement")).toBeVisible();
  });
});

