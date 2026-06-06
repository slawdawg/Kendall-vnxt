import { expect, test, type APIRequestContext } from "@playwright/test";

const supervisorUrl = "http://127.0.0.1:8100";

type WorkItemCreatePayload = {
  title: string;
  requestedOutcome: string;
  details?: string;
  riskLevel?: "low" | "medium" | "high";
  source?: string;
  metadata?: Record<string, string | boolean>;
};

async function createWorkItem(request: APIRequestContext, payload: WorkItemCreatePayload) {
  const response = await request.post(`${supervisorUrl}/work-items`, {
    data: {
      source: payload.source ?? "playwright",
      riskLevel: payload.riskLevel ?? "medium",
      details: payload.details ?? null,
      title: payload.title,
      requestedOutcome: payload.requestedOutcome,
      metadata: {
        suite: "playwright",
        ...(payload.metadata ?? {}),
      },
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { data: { id: string } };
  return body.data.id;
}

async function getWorkItem(request: APIRequestContext, workItemId: string) {
  const response = await request.get(`${supervisorUrl}/work-items/${workItemId}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { data: { state: string } };
}

async function waitForState(
  request: APIRequestContext,
  workItemId: string,
  expectedState: string,
) {
  await expect
    .poll(async () => {
      const body = await getWorkItem(request, workItemId);
      return body.data.state;
    })
    .toBe(expectedState);
}

async function applyAction(
  request: APIRequestContext,
  workItemId: string,
  action: string,
  note?: string,
) {
  const response = await request.post(`${supervisorUrl}/work-items/${workItemId}/actions`, {
    data: {
      action,
      note: note ?? null,
      actorId: "playwright",
      actorLabel: "Playwright",
    },
  });

  expect(response.ok()).toBeTruthy();
}

async function escalateWorkItem(request: APIRequestContext, workItemId: string, reason: string) {
  const response = await request.post(`${supervisorUrl}/work-items/${workItemId}/escalation`, {
    data: {
      reason,
      actorId: "playwright",
      actorLabel: "Playwright",
    },
  });

  expect(response.ok()).toBeTruthy();
}

test.describe("dashboard workflow coverage", () => {
  test("guides a non-coder through intake templates and advanced fields", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Review risky work" }).click();
    await expect(page.getByText("Template selected: Review risky work. Fill in the blanks and launch the work.")).toBeVisible();
    await expect(page.getByLabel("3. Describe the result you need")).toHaveValue(
      "Produce a clear risk decision with enough evidence for operators to act confidently.",
    );
    await expect(page.getByLabel("Helpful context")).toHaveValue(/Risk concerns:/);

    await page.getByRole("button", { name: "Adjust advanced fields" }).click();
    await expect(page.getByLabel("Source")).toHaveValue("operator-dashboard:audit");

    await page.getByLabel("2. Name the work").fill("Audit the release checklist");
    await page.getByRole("button", { name: "Start work" }).click();

    await expect(page).toHaveURL(/\/work-items\/.+/);
    await expect(page.getByText("Audit the release checklist")).toBeVisible();
  });

  test("advances a work item through compact workflow action buttons on the board", async ({ page, request }) => {
    const workItemId = await createWorkItem(request, {
      title: "Compact action progression",
      requestedOutcome: "Verify the queue card action buttons advance workflow state.",
    });

    await waitForState(request, workItemId, "implementing");

    await page.goto("/");

    const card = page.locator("article").filter({ hasText: "Compact action progression" }).first();
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: "Send to validation" }).click();
    await expect(card.getByText("Implementation handed off to validation.")).toBeVisible();
    await expect(card.getByRole("button", { name: "Validation passed" })).toBeVisible();

    await card.getByRole("button", { name: "Validation passed" }).click();
    await expect(card.getByText("Validation accepted the latest attempt.")).toBeVisible();
    await expect(card.getByRole("button", { name: "Approve work" })).toBeVisible();
  });

  test("uses sticky detail anchors to jump between request detail, history, and actions", async ({ page, request }) => {
    const workItemId = await createWorkItem(request, {
      title: "Detail anchor navigation",
      requestedOutcome: "Verify sticky detail links land on the right sections.",
      details: [
        "Operator supplied context block one.",
        "Operator supplied context block two.",
        "Operator supplied context block three.",
        "Operator supplied context block four.",
      ].join("\n\n"),
      riskLevel: "high",
    });

    await waitForState(request, workItemId, "implementing");
    await applyAction(request, workItemId, "submit_for_validation", "Ready for validation.");
    await applyAction(request, workItemId, "validation_passed", "Checks look clean.");

    await page.goto(`/work-items/${workItemId}`);

    await page.getByRole("link", { name: "Request detail" }).click();
    await expect(page).toHaveURL(new RegExp(`/work-items/${workItemId}#request-detail$`));
    await expect(page.locator("#request-detail")).toBeInViewport();

    await page.getByRole("link", { name: "Retries" }).click();
    await expect(page).toHaveURL(new RegExp(`/work-items/${workItemId}#retry-history$`));
    await expect(page.locator("#retry-history")).toBeInViewport();
    await expect(page.getByText("Implementation attempts")).toBeVisible();

    await page.getByRole("link", { name: "History" }).click();
    await expect(page).toHaveURL(new RegExp(`/work-items/${workItemId}#workflow-history$`));
    await expect(page.locator("#workflow-history")).toBeInViewport();
    await expect(page.getByText("Ready for validation.").first()).toBeVisible();

    await page.getByRole("link", { name: "Move work" }).click();
    await expect(page).toHaveURL(new RegExp(`/work-items/${workItemId}#workflow-actions$`));
    await expect(page.locator("#workflow-actions")).toBeInViewport();
    await expect(page.getByRole("button", { name: "Approve work" })).toBeVisible();
  });

  test("filters the attention queue down to self-detected supervisor issues", async ({ page, request }) => {
    const selfDetectedId = await createWorkItem(request, {
      title: "Workspace health drift",
      requestedOutcome: "Surface a supervisor-detected issue in attention filters.",
      source: "supervisor-monitor",
      metadata: {
        generatedBy: "supervisor",
        selfDetectedIssue: true,
        issueCategory: "workspace-health",
      },
    });
    const operatorId = await createWorkItem(request, {
      title: "Operator escalation control",
      requestedOutcome: "Keep a plain operator attention item visible for comparison.",
      source: "operator-dashboard",
    });

    await escalateWorkItem(request, selfDetectedId, "Supervisor detected workspace drift.");
    await escalateWorkItem(request, operatorId, "Operator asked for a manual review.");

    await page.goto("/attention");
    await page.getByRole("button", { name: "Self-detected issues" }).click();

    const issueCard = page.locator("article").filter({ hasText: "Workspace health drift" }).first();
    await expect(issueCard).toBeVisible();
    await expect(issueCard.getByText("Self-detected")).toBeVisible();
    await expect(issueCard.getByText("Issue category: workspace-health")).toBeVisible();

    await expect(page.locator("article").filter({ hasText: "Operator escalation control" })).toHaveCount(0);
  });
});
