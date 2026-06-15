import { expect, test, devices } from "@playwright/test";

const supervisorUrl = process.env.PLAYWRIGHT_SUPERVISOR_URL ?? "http://127.0.0.1:8100";

test.use(devices["Pixel 5"]);

test("shows proposed work on a phone viewport", async ({ page, request }) => {
  const response = await request.post(`${supervisorUrl}/candidate-work`, {
    data: {
      title: "Chief of Staff follow-up",
      requestedOutcome: "Review a proposed calendar handoff before it becomes active work.",
      source: "chief_of_staff",
      sourceArtifactPath: "_bmad-output/planning-artifacts/chief-of-staff/follow-up.md",
      sourceArtifactType: "chief_of_staff_request",
      riskLevel: "low",
      priority: "normal",
    },
  });
  expect(response.ok()).toBeTruthy();

  await page.goto("/proposed-work");

  await expect(page.getByRole("heading", { name: "Ideas waiting at the front door" })).toBeVisible();
  const card = page.locator("article").filter({ hasText: "Chief of Staff follow-up" }).first();
  await expect(card).toBeVisible();
  await expect(card.getByText("Chief of Staff", { exact: true })).toBeVisible();
  await expect(card.getByText("Low risk")).toBeVisible();
  await expect(card.getByText("Normal priority")).toBeVisible();
  await expect(card.getByText("_bmad-output/planning-artifacts/chief-of-staff/follow-up.md")).toBeVisible();
});

test("restores a saved intake draft after refresh and clears it after submit", async ({ page }) => {
  await page.goto("/controls");

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

  await page.goto("/controls");
  await expect(page.getByLabel("2. Name the work")).toHaveValue("");
  await expect(page.getByLabel("3. Describe the result you need")).toHaveValue("");
  await expect(page.getByLabel("Helpful context")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Start from scratch" })).toHaveClass(/border-\[var\(--accent\)\]/);
  await page.getByRole("button", { name: "Adjust advanced fields" }).click();
  await expect(page.getByLabel("Source")).toHaveValue("operator-dashboard");
});

