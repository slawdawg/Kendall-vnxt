import { expect, test, devices } from "@playwright/test";

test.use(devices["Pixel 5"]);

test("restores a saved intake draft after refresh and clears it after submit", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Fix a problem" }).click();
  await page.getByLabel("2. Name the work").fill("Draft restore smoke");
  await page
    .getByLabel("3. Describe the result you need")
    .fill("Keep unfinished intake work intact on a phone-sized viewport.");
  await page.getByLabel("Helpful context").fill("This draft should survive a refresh before submission.");
  await page.getByRole("button", { name: "High" }).click();

  await page.reload();

  await expect(page.getByLabel("2. Name the work")).toHaveValue("Draft restore smoke");
  await expect(page.getByLabel("3. Describe the result you need")).toHaveValue(
    "Keep unfinished intake work intact on a phone-sized viewport.",
  );
  await expect(page.getByLabel("Helpful context")).toHaveValue("This draft should survive a refresh before submission.");
  await expect(page.getByRole("button", { name: "Fix a problem" })).toHaveClass(/border-\[var\(--accent\)\]/);
  await expect(page.getByRole("button", { name: "High" })).toHaveClass(/border-\[var\(--accent\)\]/);

  await page.getByRole("button", { name: "Start work" }).click();
  await expect(page).toHaveURL(/\/work-items\/.+/);

  await page.goto("/");
  await expect(page.getByLabel("2. Name the work")).toHaveValue("");
  await expect(page.getByLabel("3. Describe the result you need")).toHaveValue("");
  await expect(page.getByLabel("Helpful context")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Start from scratch" })).toHaveClass(/border-\[var\(--accent\)\]/);
  await page.getByRole("button", { name: "Adjust advanced fields" }).click();
  await expect(page.getByLabel("Source")).toHaveValue("operator-dashboard");
});
