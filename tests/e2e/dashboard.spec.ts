import { expect, test, type APIRequestContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const supervisorUrl = process.env.PLAYWRIGHT_SUPERVISOR_URL ?? "http://127.0.0.1:8100";

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
  return (await response.json()) as {
    data: {
      state: string;
      assigneeId?: string | null;
      assigneeLabel?: string | null;
      escalatedAt?: string | null;
      escalationReason?: string | null;
      attentionReason?: string | null;
    };
  };
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

async function createExecutionAttempt(request: APIRequestContext, workItemId: string) {
  const response = await request.post(`${supervisorUrl}/work-items/${workItemId}/execution-attempts`, {
    data: {
      actorId: "playwright",
      actorLabel: "Playwright",
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { data: { attemptId: string } };
  return body.data.attemptId;
}

function gitOutput(args: string[]) {
  return execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8" }).trim();
}

test.describe("dashboard workflow coverage", () => {
  test("shows supervisor-owned recipe details during intake", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Expand dashboard coverage" }).click();
    await expect(page.getByText("Template selected: Expand dashboard coverage. Fill in the blanks and launch the work.")).toBeVisible();
    await expect(page.getByText("Recipe: Dashboard test coverage")).toBeVisible();
    await expect(page.getByText("Branch: e2e-*")).toBeVisible();
    await expect(page.getByText("blocked", { exact: true })).toBeVisible();
    await expect(page.getByText(/pnpm run test:e2e:dashboard/)).toBeVisible();
  });

  test("shows compact routing fleet data on controls", async ({ page, request }) => {
    const workItemId = await createWorkItem(request, {
      title: "Routing fleet evidence",
      requestedOutcome: "Record a route decision so the controls panel can show lane evidence.",
    });
    const routeResponse = await request.post(`${supervisorUrl}/work-items/${workItemId}/routing-preview`, {
      data: { taskKind: "validation_execution", recordEvent: true },
    });
    expect(routeResponse.ok()).toBeTruthy();
    const attemptResponse = await request.post(`${supervisorUrl}/work-items/${workItemId}/execution-attempts`, {
      data: { actorId: "playwright", actorLabel: "Playwright" },
    });
    expect(attemptResponse.ok()).toBeTruthy();

    await page.goto("/controls");

    const readinessPanel = page.locator("section").filter({ hasText: "Policy and evidence report" }).first();
    await expect(readinessPanel.getByText("Execution readiness", { exact: true })).toBeVisible();
    await expect(readinessPanel.getByText("Policy and evidence report")).toBeVisible();
    await expect(readinessPanel.getByText("Provider enablement ladder")).toBeVisible();
    await expect(readinessPanel.getByText("Authority checks", { exact: true })).toBeVisible();
    await expect(readinessPanel.getByText("Provider proofs")).toBeVisible();
    await expect(readinessPanel.getByText("Provider no-call proofs")).toBeVisible();

    const documentationPanel = page.locator("section").filter({ hasText: "Indexes and approval stop lines" }).first();
    await expect(documentationPanel.getByText("Documentation authority", { exact: true })).toBeVisible();
    await expect(documentationPanel.getByText("Indexes and approval stop lines")).toBeVisible();
    await expect(documentationPanel.getByText("9 pending approval")).toBeVisible();
    await expect(documentationPanel.getByText("docs/architecture/index.md", { exact: true })).toBeVisible();
    await expect(documentationPanel.getByText("blocked pending explicit approval").first()).toBeVisible();

    const verificationPanel = page.locator("section").filter({ hasText: "Checks and stop lines" }).first();
    await expect(verificationPanel.getByText("Verification readiness", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("Checks and stop lines")).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:e2e-report", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:reports", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:runbooks", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:runtime-export", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:safe-backlog", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:managed-recipes", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:e2e:dashboard:controls", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:e2e:dashboard:detail", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:e2e:dashboard:mobile", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:e2e:dashboard:managed", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:e2e:dashboard:managed:mobile", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:e2e:dashboard", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("Passing verification does not approve local provider/model calls.")).toBeVisible();
    await expect(page.locator("#verification-readiness-report")).toBeVisible();

    const dashboardE2EPanel = page.locator("section").filter({ hasText: "Browser verification map" }).first();
    await expect(dashboardE2EPanel.getByText("Dashboard e2e", { exact: true })).toBeVisible();
    await expect(dashboardE2EPanel.getByRole("heading", { name: "Browser verification map" })).toBeVisible();
    await expect(dashboardE2EPanel.getByText("pnpm run test:e2e:dashboard:controls", { exact: true })).toBeVisible();
    await expect(dashboardE2EPanel.getByText("pnpm run test:e2e:dashboard:detail", { exact: true })).toBeVisible();
    await expect(dashboardE2EPanel.getByText("pnpm run test:e2e:dashboard:mobile", { exact: true })).toBeVisible();
    await expect(dashboardE2EPanel.getByText("pnpm run test:e2e:dashboard:managed", { exact: true })).toBeVisible();
    await expect(dashboardE2EPanel.getByText("pnpm run test:e2e:dashboard:managed:mobile", { exact: true })).toBeVisible();
    await expect(dashboardE2EPanel.getByText("pnpm run check:e2e-report", { exact: true })).toBeVisible();
    await expect(dashboardE2EPanel.getByText("Browser verification does not approve local provider/model calls.")).toBeVisible();

    const reportCatalogPanel = page.locator("section").filter({ hasText: "Supervisor evidence map" }).first();
    await expect(reportCatalogPanel.getByText("Report catalog", { exact: true })).toBeVisible();
    await expect(reportCatalogPanel.getByText("Supervisor evidence map")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/execution-readiness-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/verification-readiness-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/dashboard-e2e-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/safe-development-backlog")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/managed-recipe-policy-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/github-workflow-policy-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("Catalog entries are references, not approvals.")).toBeVisible();
    await expect(page.locator("#supervisor-report-catalog")).toBeVisible();

    const maintenancePanel = page.locator("section").filter({ hasText: "Safe work map" }).first();
    await expect(maintenancePanel.getByText("Maintenance readiness", { exact: true })).toBeVisible();
    await expect(maintenancePanel.getByText("Safe work map")).toBeVisible();
    await expect(maintenancePanel.getByText("documentation-hygiene")).toBeVisible();
    await expect(maintenancePanel.getByText("verification-hygiene")).toBeVisible();
    await expect(maintenancePanel.getByText("authority-blocker-watch")).toBeVisible();
    await expect(maintenancePanel.getByText("Maintenance work must not approve local provider/model calls.")).toBeVisible();

    const safeBacklogPanel = page.locator("section").filter({ hasText: "Large-slice development map" }).first();
    await expect(safeBacklogPanel.getByText("Safe backlog", { exact: true })).toBeVisible();
    await expect(safeBacklogPanel.getByText("Large-slice development map")).toBeVisible();
    await expect(safeBacklogPanel.getByText("Report-aligned backlog governance")).toBeVisible();
    await expect(safeBacklogPanel.getByText("Verification surface hardening")).toBeVisible();
    await expect(safeBacklogPanel.getByText("Execution-authority stories")).toBeVisible();
    await expect(safeBacklogPanel.getByText("Safe backlog items are planning and maintenance guidance, not execution-authority approvals.")).toBeVisible();

    const managedRecipePolicyPanel = page
      .locator("section")
      .filter({ hasText: "Managed recipe policies are not execution-authority approvals." })
      .first();
    await expect(managedRecipePolicyPanel.getByText("Policy report")).toBeVisible();
    await expect(managedRecipePolicyPanel.getByText("Dashboard test coverage")).toBeVisible();
    await expect(managedRecipePolicyPanel.getByText("Dashboard mobile coverage")).toBeVisible();
    await expect(managedRecipePolicyPanel.getByText("Remote automation", { exact: true })).toBeVisible();
    await expect(managedRecipePolicyPanel.getByText("Managed recipe policies are not execution-authority approvals.")).toBeVisible();
    await expect(page.locator("#managed-recipe-policy-report")).toBeVisible();

    const githubPolicyPanel = page.locator("section").filter({ hasText: "Delivery policy" }).first();
    await expect(githubPolicyPanel.getByText("GitHub workflow", { exact: true })).toBeVisible();
    await expect(githubPolicyPanel.getByText("Git remotes use Git Credential Manager")).toBeVisible();
    await expect(githubPolicyPanel.getByText("Codex GitHub connector handles PR work")).toBeVisible();
    await expect(githubPolicyPanel.getByText("pnpm run doctor:github -- --remote")).toBeVisible();
    await expect(githubPolicyPanel.getByText("Plaintext tokens")).toBeVisible();
    await expect(githubPolicyPanel.getByText("Do not create persistent plaintext GitHub CLI tokens")).toBeVisible();
    await expect(page.locator("#github-workflow-policy-report")).toBeVisible();

    const fleetPanel = page.locator("#routing-fleet");
    await expect(fleetPanel.getByText("Routing Fleet")).toBeVisible();
    await expect(fleetPanel.getByText("Internal utility worker")).toBeVisible();
    await expect(fleetPanel.getByText("Premium approval lane")).toBeVisible();
    await expect(fleetPanel.getByText("Workers online")).toBeVisible();
    await expect(fleetPanel.getByText("Lane evidence")).toBeVisible();
    await expect(fleetPanel.getByText("Decisions 1")).toBeVisible();
    await expect(fleetPanel.getByText("Task Deterministic Check")).toBeVisible();
  });
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

    await page.getByRole("link", { name: "Request detail", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/work-items/${workItemId}#request-detail$`));
    await expect(page.locator("#request-detail")).toBeInViewport();

    await page.getByRole("link", { name: "Retries", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/work-items/${workItemId}#retry-history$`));
    await expect(page.locator("#retry-history")).toBeInViewport();
    await expect(page.getByText("Implementation attempts")).toBeVisible();

    await page.getByRole("link", { name: "History", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/work-items/${workItemId}#workflow-history$`));
    await expect(page.locator("#workflow-history")).toBeInViewport();
    await expect(page.getByText("Ready for validation.").first()).toBeVisible();

    await page.getByRole("link", { name: "Move work", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/work-items/${workItemId}#workflow-actions$`));
    await expect(page.locator("#workflow-actions")).toBeInViewport();
    await expect(page.getByRole("button", { name: "Approve work" })).toBeVisible();
  });

  test("lets an operator claim ownership, escalate, and clear escalation from the detail page", async ({ page, request }) => {
    const workItemId = await createWorkItem(request, {
      title: "Detail operator controls",
      requestedOutcome: "Verify assignment and escalation controls persist through the supervisor.",
      details: "Use the detail page controls to claim the item and mark it for follow-up.",
    });

    await waitForState(request, workItemId, "implementing");
    await page.goto(`/work-items/${workItemId}`);
    const assignmentPanel = page.locator("section").filter({ hasText: "Assignment" }).last();
    const escalationPanel = page.locator("section").filter({ hasText: "Attention and escalation" }).last();

    await page.getByRole("button", { name: "Claim ownership" }).click();
    await expect(assignmentPanel.getByText("Assigned to Primary operator.")).toBeVisible();
    await expect
      .poll(async () => {
        const body = await getWorkItem(request, workItemId);
        return body.data.assigneeId ?? null;
      })
      .toBe("operator-1");

    await escalationPanel.getByLabel("Escalation note").fill("Waiting on product confirmation before validation can continue.");
    await page.getByRole("button", { name: "Escalate item" }).click();
    await expect(escalationPanel.getByText("Escalation recorded.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear escalation" })).toBeVisible();
    await expect
      .poll(async () => {
        const body = await getWorkItem(request, workItemId);
        return body.data.escalationReason ?? null;
      })
      .toBe("Waiting on product confirmation before validation can continue.");

    await page.reload();
    await expect(page.locator("section").filter({ hasText: "Attention and escalation" }).last().getByText("Escalated by Primary operator.")).toBeVisible();
    await expect(
      page.locator("section").filter({ hasText: "Attention and escalation" }).last().getByText("Waiting on product confirmation before validation can continue.").first(),
    ).toBeVisible();

    await page.getByRole("button", { name: "Clear escalation" }).click();
    await expect(page.locator("section").filter({ hasText: "Attention and escalation" }).last().getByText("Escalation cleared.")).toBeVisible();
    await expect
      .poll(async () => {
        const body = await getWorkItem(request, workItemId);
        return body.data.escalatedAt ?? null;
      })
      .toBe(null);
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

  test("shows routing badge and route rationale on work item detail", async ({ page, request }) => {
    const workItemId = await createWorkItem(request, {
      title: "Routing detail explanation",
      requestedOutcome: "Verify the dashboard explains the supervisor routing preview.",
      source: "operator-dashboard:improvement",
      riskLevel: "medium",
      metadata: {
        executionRecipeId: "dashboard-test-coverage",
        intakeTemplateId: "operator-test-coverage",
      },
    });

    await page.goto(`/work-items/${workItemId}`);

    await page.getByRole("link", { name: "Routing", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/work-items/${workItemId}#routing-decision$`));

    const routingPanel = page.locator("#routing-decision");
    await expect(routingPanel).toBeInViewport();
    await expect(routingPanel.getByText("Why This Route?")).toBeVisible();
    await expect(routingPanel.getByText("Utility", { exact: true })).toBeVisible();
    await expect(routingPanel.getByText("Record Only").first()).toBeVisible();
    await expect(routingPanel.getByText("high", { exact: true })).toBeVisible();
    await expect(routingPanel.getByText("Execution affected")).toBeVisible();
    await expect(routingPanel.getByText("No", { exact: true })).toBeVisible();
    await expect(routingPanel.getByText("Task Deterministic Check")).toBeVisible();
    await expect(routingPanel.getByText("Local read-only").first()).toBeVisible();
    await expect(routingPanel.getByText("Permission summary")).toBeVisible();
  });

  test("shows execution attempt evidence and disabled workspace boundaries on work item detail", async ({ page, request }) => {
    const workItemId = await createWorkItem(request, {
      title: "Execution attempt evidence panel",
      requestedOutcome: "Verify attempt status, route binding, and workspace isolation are visible.",
      source: "operator-dashboard:improvement",
      riskLevel: "medium",
      metadata: {
        executionRecipeId: "dashboard-test-coverage",
        intakeTemplateId: "operator-test-coverage",
      },
    });
    await createExecutionAttempt(request, workItemId);

    await page.goto(`/work-items/${workItemId}`);

    const overviewPanel = page.locator("section").filter({ hasText: "Evidence overview" }).first();
    await expect(overviewPanel.getByText("Review map")).toBeVisible();
    await expect(overviewPanel.getByText("No execution controls")).toBeVisible();
    await expect(overviewPanel.getByText("Runtime export", { exact: true })).toBeVisible();
    await expect(overviewPanel.getByText("authority flags disabled")).toBeVisible();
    await expect(overviewPanel.getByRole("heading", { name: "Report shortcuts" })).toBeVisible();
    await expect(overviewPanel.getByRole("link", { name: "Open catalog" })).toBeVisible();
    await expect(overviewPanel.getByRole("link", { name: "GET /supervisor/execution-configuration-checks" })).toBeVisible();
    await expect(overviewPanel.getByRole("link", { name: "GET /supervisor/threat-boundary" })).toBeVisible();
    await expect(overviewPanel.getByRole("link", { name: "GET /supervisor/execution-configuration-checks" })).toHaveAttribute(
      "href",
      "/controls#execution-readiness-report",
    );
    await expect(overviewPanel.getByRole("link", { name: "GET /supervisor/threat-boundary" })).toHaveAttribute(
      "href",
      "/controls#execution-readiness-report",
    );
    await expect(overviewPanel.getByRole("heading", { name: "Review shortcuts" })).toBeVisible();
    await expect(overviewPanel.getByText("3 shortcuts")).toBeVisible();
    await expect(overviewPanel.getByRole("link", { name: /Runtime state/ })).toBeVisible();
    await expect(overviewPanel.getByRole("link", { name: /Authority boundary/ })).toBeVisible();
    await expect(overviewPanel.getByRole("link", { name: /Git-backed evidence/ })).toBeVisible();

    await page.getByRole("link", { name: "Attempts", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/work-items/${workItemId}#execution-attempts$`));

    const attemptPanel = page.locator("#execution-attempts");
    await expect(attemptPanel).toBeInViewport();
    await expect(attemptPanel.getByText("Attempt evidence")).toBeVisible();
    await expect(attemptPanel.getByText("1 recorded")).toBeVisible();
    await expect(attemptPanel.getByText("Latest status")).toBeVisible();
    await expect(attemptPanel.getByText("Planned").first()).toBeVisible();
    await expect(attemptPanel.getByText("utility.internal").first()).toBeVisible();
    await expect(attemptPanel.getByText("Workspace isolation")).toBeVisible();
    await expect(attemptPanel.getByText("Write roots")).toBeVisible();
    await expect(attemptPanel.getByText("None", { exact: true }).first()).toBeVisible();
    await expect(attemptPanel.getByText("Source mutation: disabled")).toBeVisible();
    await expect(attemptPanel.getByText("Commands: disabled")).toBeVisible();
    await expect(attemptPanel.getByText("Credentials: disabled")).toBeVisible();
    await expect(attemptPanel.getByText("_bmad-output/execution-attempts")).toBeVisible();

    await page.getByRole("link", { name: "Export", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/work-items/${workItemId}#runtime-evidence-export$`));

    const exportPanel = page.locator("#runtime-evidence-export");
    await expect(exportPanel).toBeInViewport();
    await expect(exportPanel.getByText("Evidence package")).toBeVisible();
    await expect(exportPanel.getByRole("heading", { name: "Safety flags" })).toBeVisible();
    await expect(exportPanel.getByText("Provider calls: disabled")).toBeVisible();
    await expect(exportPanel.getByRole("heading", { name: "Review navigator" })).toBeVisible();
    await expect(exportPanel.getByRole("heading", { name: "Runtime state" })).toBeVisible();
    await expect(exportPanel.getByRole("heading", { name: "Authority boundary" })).toBeVisible();
    await expect(exportPanel.getByRole("heading", { name: "Git-backed evidence" })).toBeVisible();
    await expect(exportPanel.getByText("Review navigation is not execution-authority approval.")).toBeVisible();
    await expect(exportPanel.getByRole("heading", { name: "Related reports" })).toBeVisible();
    await expect(exportPanel.getByText("GET /supervisor/execution-readiness-report", { exact: true })).toBeVisible();
    await expect(exportPanel.getByRole("link", { name: "GET /supervisor/execution-readiness-report" })).toHaveAttribute(
      "href",
      "/controls#execution-readiness-report",
    );
    await expect(exportPanel.getByRole("link", { name: "GET /supervisor/safe-development-backlog" })).toHaveAttribute(
      "href",
      "/controls#safe-development-backlog",
    );
    await expect(exportPanel.getByRole("heading", { name: "Review manifest" })).toBeVisible();
    await expect(exportPanel.getByRole("heading", { name: "Review checklist" })).toBeVisible();
    await expect(exportPanel.getByRole("heading", { name: "Retention notes" })).toBeVisible();
    await expect(exportPanel.getByRole("heading", { name: "Manifest stop lines" })).toBeVisible();
    await expect(exportPanel.getByText("The review manifest is not execution-authority approval.")).toBeVisible();
  });

  test("shows delivery readiness controls for managed recipe work", async ({ page, request }) => {
    const workItemId = await createWorkItem(request, {
      title: "Managed delivery package review",
      requestedOutcome: "Verify managed recipe delivery evidence is visible before operator approval.",
      source: "operator-dashboard:improvement",
      riskLevel: "medium",
      metadata: {
        executionRecipeId: "dashboard-test-coverage",
        intakeTemplateId: "operator-test-coverage",
      },
    });
    await page.goto(`/work-items/${workItemId}`);

    const deliveryPanel = page.locator("section").filter({ hasText: "Review readiness" }).first();
    await expect(deliveryPanel).toBeVisible();
    await expect(deliveryPanel.getByText("record-only; supervisor did not create a PR, wait for CI, or merge")).toBeVisible();
    await expect(deliveryPanel.getByText("Needs evidence", { exact: true })).toBeVisible();
    await expect(deliveryPanel.getByRole("button", { name: "Record readiness" })).toBeVisible();

    const gateAudit = page.locator("#recipe-gate-audit");
    await expect(gateAudit.getByText("Supervisor policy ledger")).toBeVisible();
    await expect(gateAudit.getByText("Next managed action")).toBeVisible();
    await expect(gateAudit.getByText("Remote: blocked")).toBeVisible();
    await expect(gateAudit.getByRole("button", { name: "Run approved action" })).toBeVisible();
    await expect(gateAudit.getByText("Delivery readiness gate")).toBeVisible();
    await expect(gateAudit.getByText("Delivery readiness evidence or waiver is still required.")).toBeVisible();

    const recipePanel = page.locator("section").filter({ hasText: "Execution recipe" }).first();
    await expect(recipePanel.getByText("Remote automation policy")).toBeVisible();
    await expect(recipePanel.getByText("pull request creation")).toBeVisible();
    await expect(recipePanel.getByText("KNX data boundary accepts the remote destination")).toBeVisible();

    const branchPanel = page.locator("section").filter({ hasText: "Prepare execution branch" }).first();
    await expect(branchPanel).toBeVisible();
    await expect(branchPanel.getByRole("button", { name: "Prepare branch" })).toBeVisible();

    const gateAuditPanel = page.locator("#recipe-gate-audit");
    await expect(gateAuditPanel).toBeVisible();
    await expect(gateAuditPanel.getByText("Scope gate", { exact: true })).toBeVisible();
    await expect(gateAuditPanel.getByText("Delivery readiness gate")).toBeVisible();
    await expect(gateAuditPanel.getByText("Pending").first()).toBeVisible();
  });

  test("runs the supervisor-approved managed triage action from the gate audit", async ({ page, request }) => {
    const workItemId = await createWorkItem(request, {
      title: "Managed triage action",
      requestedOutcome: "Verify the dashboard can trigger the supervisor-approved next action.",
      source: "operator-dashboard:improvement",
      riskLevel: "medium",
      metadata: {
        executionRecipeId: "dashboard-test-coverage",
        intakeTemplateId: "operator-test-coverage",
      },
    });

    await page.goto(`/work-items/${workItemId}`);

    const gateAudit = page.locator("#recipe-gate-audit");
    await expect(gateAudit.getByText("Supervisor policy ledger")).toBeVisible();
    await expect(gateAudit.getByText("Next managed action")).toBeVisible();
    await expect(gateAudit.getByText("Let supervisor finish recipe triage")).toBeVisible();
    await expect(gateAudit.getByRole("button", { name: "Run approved action" })).toBeVisible();

    await gateAudit.getByRole("button", { name: "Run approved action" }).click();

    await expect
      .poll(async () => {
        const response = await request.get(`${supervisorUrl}/work-items/${workItemId}`);
        expect(response.ok()).toBeTruthy();
        const body = (await response.json()) as { data: { state: string; nextStep: string | null } };
        return body.data.state;
      })
      .toBe("ready");

    await expect(page.getByRole("button", { name: "Prepare branch" })).toBeVisible();
    await expect(page.getByText("Prepare execution branch")).toBeVisible();
  });

  test("surfaces recovery guidance when managed recipe blocks on branch policy", async ({ page, request }) => {
    const currentBranch = gitOutput(["branch", "--show-current"]);
    const currentBaseRevision = gitOutput(["rev-parse", "--verify", "main"]);

    const workItemId = await createWorkItem(request, {
      title: "Managed recipe branch recovery",
      requestedOutcome: "Verify the dashboard can surface supervisor recovery guidance when branch policy blocks.",
      source: "operator-dashboard:improvement",
      riskLevel: "medium",
      metadata: {
        executionRecipeId: "dashboard-test-coverage",
        intakeTemplateId: "operator-test-coverage",
        executionBranch: currentBranch,
        baseBranch: "main",
        baseRevision: currentBaseRevision,
      },
    });

    await page.goto(`/work-items/${workItemId}`);

    const gateAudit = page.locator("#recipe-gate-audit");

    const triageResponse = await request.post(`${supervisorUrl}/work-items/${workItemId}/managed-next-action`, {
      data: {
        expectedActionId: "supervisor_triage",
        note: "Let the supervisor finish intake triage.",
        actorId: "playwright",
        actorLabel: "Playwright",
      },
    });
    expect(triageResponse.ok()).toBeTruthy();
    await expect
      .poll(async () => {
        const response = await request.get(`${supervisorUrl}/work-items/${workItemId}`);
        expect(response.ok()).toBeTruthy();
        const body = (await response.json()) as { data: { state: string } };
        return body.data.state;
      })
      .toBe("blocked");
    await page.reload();

    await expect(page.getByText("Blocked", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Recipe branch must start with e2e-.").first()).toBeVisible();
    await expect(gateAudit.getByText("Resolve blocked policy gate")).toBeVisible();
    await expect(gateAudit.getByText("Review branch ownership")).toBeVisible();
    await expect(gateAudit.getByText("operator-checkpoint")).toBeVisible();
  });
});
