import { expect, test, devices } from "@playwright/test";

test.use(devices["iPhone 13"]);

test("restores a saved intake draft after refresh and clears it after submit", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Title").fill("Draft restore smoke");
  await page.getByLabel("Requested outcome").fill("Keep unfinished intake work intact on a phone-sized viewport.");
  await page.getByLabel("Details").fill("This draft should survive a refresh before submission.");
  await page.getByRole("button", { name: "High" }).click();

  await page.reload();

  await expect(page.getByLabel("Title")).toHaveValue("Draft restore smoke");
  await expect(page.getByLabel("Requested outcome")).toHaveValue(
    "Keep unfinished intake work intact on a phone-sized viewport.",
  );
  await expect(page.getByLabel("Details")).toHaveValue("This draft should survive a refresh before submission.");
  await expect(page.getByRole("button", { name: "High" })).toHaveClass(/border-\[var\(--accent\)\]/);

  await page.getByRole("button", { name: "Create work item" }).click();
  await expect(page).toHaveURL(/\/work-items\/.+/);

  await page.goto("/");
  await expect(page.getByLabel("Title")).toHaveValue("");
  await expect(page.getByLabel("Requested outcome")).toHaveValue("");
  await expect(page.getByLabel("Details")).toHaveValue("");
  await expect(page.getByLabel("Source")).toHaveValue("operator-dashboard");
});
