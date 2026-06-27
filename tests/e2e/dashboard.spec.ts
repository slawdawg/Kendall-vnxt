import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const supervisorUrl = process.env.PLAYWRIGHT_SUPERVISOR_URL ?? "http://127.0.0.1:8100";

async function openCompactDashboardNav(page: Page) {
  const menu = page.locator(".dashboard-page-menu");
  const menuSummary = page.locator(".dashboard-page-menu-summary");
  await expect(menuSummary).toBeVisible();
  if (!(await menu.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await menuSummary.click();
  }
}

type WorkItemCreatePayload = {
  title: string;
  requestedOutcome: string;
  details?: string;
  riskLevel?: "low" | "medium" | "high";
  source?: string;
  metadata?: Record<string, string | boolean>;
};

type CandidateWorkCreatePayload = {
  title: string;
  requestedOutcome: string;
  source: "bmad" | "chief_of_staff" | "operator" | "supervisor";
  sourceArtifactPath: string;
  sourceArtifactType: "bmad_story" | "bmad_research" | "bmad_workflow_output" | "chief_of_staff_request" | "manual_note";
  riskLevel?: "low" | "medium" | "high";
  priority?: "low" | "normal" | "high" | "urgent";
};

type PipelineViewportTarget = {
  width: number;
  height: number;
};

function pipelineViewportForProject(projectName: string): PipelineViewportTarget {
  if (projectName === "ipad-pro-gen-2-safari-ios-26") {
    return { width: 1024, height: 1366 };
  }
  if (projectName === "iphone-15-pro-max-safari-ios-27") {
    return { width: 430, height: 932 };
  }
  return { width: 1440, height: 960 };
}

async function createCandidateWork(request: APIRequestContext, payload: CandidateWorkCreatePayload) {
  const response = await request.post(`${supervisorUrl}/candidate-work`, { data: payload });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { data: { id: string } };
  return body.data.id;
}

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

async function createSubscriptionLaunchStubEvent(request: APIRequestContext, workItemId: string, requestedAgent = "codex") {
  const response = await request.post(`${supervisorUrl}/work-items/${workItemId}/subscription-agent-launch-stub`, {
    data: {
      taskKind: "architecture_review",
      requestedAgent,
      recordEvent: true,
    },
  });

  expect(response.ok()).toBeTruthy();
}

const allowedSubscriptionLaunchFields = new Set([
  "workItemId",
  "attemptId",
  "executionAttemptId",
  "routeDecisionId",
  "workerId",
  "lane",
  "authorityMode",
  "workspacePlanId",
  "launchPolicyId",
  "targetId",
  "commandTemplateId",
  "commandTemplateExecutionStatus",
  "approvalActor",
  "approvalTimestamp",
  "approvalExpiry",
  "permissionEnvelope",
  "environmentAllowlist",
  "blockedCredentialSessionPaths",
  "artifactLimits",
  "redactionPolicy",
  "truncationPolicy",
  "outputPolicy",
  "startupTimeoutSeconds",
  "runTimeoutSeconds",
  "cancellationTimeoutSeconds",
  "heartbeatPolicy",
  "childProcessTreeTrackingPolicy",
  "orphanDetectionPolicy",
  "terminalStateReconciliationPolicy",
  "idempotentCleanupPolicy",
  "dashboardControls",
  "rollbackPolicy",
  "verificationCommand",
  "allowedOutputMode",
]);

async function getSubscriptionLaunchApprovalBinding(request: APIRequestContext, workItemId: string, requestedAgent = "codex") {
  const stubResponse = await request.post(`${supervisorUrl}/work-items/${workItemId}/subscription-agent-launch-stub`, {
    data: {
      taskKind: "architecture_review",
      requestedAgent,
      recordEvent: false,
    },
  });

  expect(stubResponse.ok()).toBeTruthy();
  const stubBody = (await stubResponse.json()) as { data: { approvalBinding: Record<string, unknown> } };
  return Object.fromEntries(
    Object.entries(stubBody.data.approvalBinding).filter(([key]) => allowedSubscriptionLaunchFields.has(key)),
  );
}

async function createSubscriptionLaunchRejectionEvent(request: APIRequestContext, workItemId: string, requestedAgent = "codex") {
  const approvalBinding = await getSubscriptionLaunchApprovalBinding(request, workItemId, requestedAgent);
  delete approvalBinding.approvalActor;
  delete approvalBinding.approvalTimestamp;
  delete approvalBinding.approvalExpiry;
  delete approvalBinding.permissionEnvelope;

  const response = await request.post(`${supervisorUrl}/work-items/${workItemId}/subscription-agent-launch`, {
    data: {
      ...approvalBinding,
      taskKind: "architecture_review",
      requestedAgent,
      recordEvent: true,
    },
  });

  expect(response.ok()).toBeTruthy();
}

async function createSubscriptionLaunchExpiredExactApprovalEvent(request: APIRequestContext, workItemId: string, requestedAgent = "codex") {
  const approvalBinding = await getSubscriptionLaunchApprovalBinding(request, workItemId, requestedAgent);
  const response = await request.post(`${supervisorUrl}/work-items/${workItemId}/subscription-agent-launch`, {
    data: {
      ...approvalBinding,
      executionAttemptId: approvalBinding.attemptId,
      approvalActor: "Operator",
      approvalTimestamp: "2026-06-12T16:20:33.2776334-05:00",
      approvalExpiry: "2026-06-12T16:50:33.2776334-05:00",
      permissionEnvelope: "approved_for_one_artifact_only_subscription_launch",
      commandTemplateExecutionStatus: "executable_by_kendall",
      artifactLimits: {
        rawOutputBytes: 0,
        artifactReferenceOnly: true,
        sourceMutationAllowed: false,
      },
      outputPolicy: "artifact_references_only_no_raw_output",
      redactionPolicy: "required",
      truncationPolicy: "truncate_to_approved_artifact_limits",
      startupTimeoutSeconds: 10,
      runTimeoutSeconds: 30,
      cancellationTimeoutSeconds: 5,
      dashboardControls: "approval_bound_disabled_until_all_gates_green",
      verificationCommand: "pnpm run test:supervisor -- tests/integration/test_routing_preview.py -q -k subscription_agent_launch",
      allowedOutputMode: "artifact-only",
      taskKind: "architecture_review",
      requestedAgent,
      recordEvent: true,
    },
  });

  expect(response.ok()).toBeTruthy();
}

async function seedRunnerAssignmentHandoffState() {
  const stateRoot = process.env.CODEX_WORKSPACE_STATE_ROOT;
  expect(stateRoot).toBeTruthy();
  const tasksDir = path.join(stateRoot!, "tasks");
  const assignmentsDir = path.join(stateRoot!, "assignments");
  const handoffWorktreePath = path.join(stateRoot!, "worktrees", "e2e-dispatcher-queue-handoff-badges-refresh");
  await fs.mkdir(tasksDir, { recursive: true });
  await fs.mkdir(assignmentsDir, { recursive: true });
  await fs.mkdir(handoffWorktreePath, { recursive: true });
  execFileSync("git", ["init"], { cwd: handoffWorktreePath, stdio: "ignore" });
  await fs.writeFile(
    path.join(assignmentsDir, "dispatcher-cleanup-assignment-closure-refresh.json"),
    `${JSON.stringify(
      {
        assignment_id: "dispatcher-cleanup-assignment-closure-refresh",
        task_id: "20260623-dispatcher-cleanup-closes-lane-assignment-and-qu",
        lane_slug: "dispatcher-cleanup-assignment-closure-refresh",
        branch: "codex/dispatcher-cleanup-assignment-closure-refresh",
        status: "closed",
        owner: "playwright-runner",
        phase: "closed",
        closed_at: "2026-06-23T11:47:52.000Z",
        updated_at: "2026-06-23T11:47:52.000Z",
        last_result: "closed after cleanup of 20260623-dispatcher-cleanup-closes-lane-assignment-and-qu",
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    path.join(tasksDir, "read-only-evidence-polish.json"),
    `${JSON.stringify(
      {
        task_id: "20260623-read-only-evidence-polish",
        branch: "codex/read-only-evidence-polish",
        status: "closed",
        owner: "playwright-runner",
        phase: "closed",
        closed_at: "2026-06-23T11:55:52.000Z",
        updated_at: "2026-06-23T11:55:52.000Z",
        source_assignment_id: "read-only-evidence-polish",
        source_backlog_item: {
          item_id: "read-only-evidence-polish",
          status: "ready",
          branch_name: "codex/read-only-evidence-polish",
        },
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    path.join(tasksDir, "e2e-dispatcher-queue-handoff-badges-refresh.json"),
    `${JSON.stringify(
      {
        task_id: "e2e-dispatcher-queue-handoff-badges-refresh",
        branch: "codex/dispatcher-queue-handoff-badges-refresh",
        worktree_path: handoffWorktreePath,
        base_branch: "main",
        status: "active",
        owner: "playwright-runner",
        phase: "handoff",
        owner_thread_id: "playwright-thread",
        last_heartbeat_at: new Date().toISOString(),
        stale_after_seconds: 86400,
        owner_updated_at: "2026-06-23T04:20:47.461Z",
        dispatch_handoffs: [
          {
            schema_version: 1,
            lane: "dispatcher-queue-handoff-badges-refresh",
            owner: "playwright-runner",
            branch: "codex/dispatcher-queue-handoff-badges-refresh",
            workspace_action: "create_workspace",
            worktree_path: handoffWorktreePath,
            task_id: "e2e-dispatcher-queue-handoff-badges-refresh",
            next_command: "cd e2e-dispatcher-queue-handoff-badges-refresh",
            handoff: "resume this prepared worktree; no worker or provider process launched",
            stop_lines: ["no provider/model calls", "no automatic takeover without evidence and approval"],
            candidate_state_counts: {
              active: 1,
              blocked_authority: 1,
              blocked_owned_active: 1,
              closed: 9,
            },
            readiness: {
              profile: "doctor",
              status: "passed",
              command: "node ./scripts/codex-workspace.mjs doctor",
              exit_code: 0,
              summary: "OK: e2e dispatcher handoff fixture",
            },
            generated_at: "2026-06-23T04:20:47.461Z",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

function seedSubscriptionLaunchVerificationEvent(workItemId: string) {
  const dbPath = process.env.PLAYWRIGHT_E2E_DB_PATH;
  expect(dbPath).toBeTruthy();
  const payload = {
    status: "failed",
    readinessStatus: "subscription_launch_rollback_triggered",
    subscriptionLaunchVerification: {
      attemptId: "subscription-launch-fixture-attempt",
      routeDecisionId: "route-subscription-launch-fixture",
      status: "failed",
      commandId: "subscription-launch-fixture-check",
      commandShape: "pnpm run test:supervisor -- tests/integration/test_routing_preview.py -q -k subscription_agent_launch",
      summary: "Approved subscription launch verification command exited with code 1.",
      artifactRef: "_bmad-output/subscription-launch/verification-summary.json",
      recoveryPath: "inspect retained subscription launch artifacts before retry or rollback",
      rollbackStatus: "triggered",
      rollbackReason: "verification_failed",
      blockedReason: "subscription-launch-verification-failed",
      rollbackBlockedReason: "subscription_launch_rollback_triggered",
      deliveryEligible: false,
      nextSafeAction: "Keep subscription-agent launch disabled until the operator reviews retained artifacts.",
      rawOutputRetained: false,
    },
    outputArtifactSummary: {
      artifactReferences: [
        {
          artifactKind: "verification_result",
          path: "_bmad-output/subscription-launch/verification-summary.json",
          rawPayloadStored: false,
          operatorReviewRequired: true,
        },
      ],
      rawOutputStored: false,
    },
  };
  const script = [
    "import json, sqlite3, sys, uuid",
    "from datetime import datetime, timezone",
    "db_path, work_item_id, payload_json = sys.argv[1:4]",
    "conn = sqlite3.connect(db_path)",
    "conn.execute(\"insert into workflow_events (id, work_item_id, event_type, actor_type, actor_id, actor_label, correlation_id, summary, payload, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\", (str(uuid.uuid4()), work_item_id, 'execution_attempt.verification_recorded', 'supervisor', None, None, str(uuid.uuid4()), 'Verification evidence recorded with status failed.', payload_json, datetime.now(timezone.utc).isoformat()))",
    "conn.commit()",
    "conn.close()",
  ].join("; ");
  const pythonPath = "services/supervisor/.venv/bin/python";
  execFileSync(pythonPath, ["-c", script, dbPath!, workItemId, JSON.stringify(payload)], {
    cwd: process.cwd(),
  });
}

type ProviderRawOutputUiFixtureCase = {
  caseId: string;
  title: string;
  status: string;
  readinessStatus: string;
  artifactKind: string;
  blockedReason: string;
  recoveryPath: string;
  nextSafeAction: string;
  rawSentinels: string[];
};

async function loadProviderRawOutputUiFixtures() {
  const fixturePath = path.join(process.cwd(), "tests", "fixtures", "provider-raw-output-ui", "cases.json");
  const fixtureSource = await fs.readFile(fixturePath, "utf8");
  const fixtures = JSON.parse(fixtureSource) as ProviderRawOutputUiFixtureCase[];
  for (const fixture of fixtures) {
    expect(fixture.rawSentinels, `${fixture.caseId} must define exactly five raw-output sentinels`).toHaveLength(5);
    for (const sentinel of fixture.rawSentinels) {
      expect(typeof sentinel, `${fixture.caseId} sentinel must be a string`).toBe("string");
      expect(sentinel, `${fixture.caseId} sentinel must be non-empty`).not.toHaveLength(0);
    }
  }
  return fixtures;
}

function seedProviderRawOutputUiFixtureEvent(workItemId: string, fixture: ProviderRawOutputUiFixtureCase) {
  const dbPath = process.env.PLAYWRIGHT_E2E_DB_PATH;
  expect(dbPath).toBeTruthy();
  const [rawPrompt, rawCompletion, providerPayload, secretValue, sourceCopy] = fixture.rawSentinels;
  const payload = {
    status: fixture.status,
    readinessStatus: fixture.readinessStatus,
    subscriptionLaunchVerification: {
      attemptId: `provider-raw-output-${fixture.caseId}`,
      routeDecisionId: `route-provider-raw-output-${fixture.caseId}`,
      status: fixture.status,
      commandId: `provider-raw-output-${fixture.caseId}`,
      commandShape: "synthetic local-only provider raw-output UI fixture",
      summary: `Bounded provider output summary for ${fixture.caseId}.`,
      artifactRef: `_bmad-output/provider-raw-output-ui/${fixture.caseId}.json`,
      recoveryPath: fixture.recoveryPath,
      rollbackStatus: "not_triggered",
      rollbackReason: null,
      blockedReason: fixture.blockedReason,
      deliveryEligible: false,
      nextSafeAction: fixture.nextSafeAction,
      rawOutputRetained: false,
      rawPrompt,
      rawCompletion,
      providerPayload,
      secretValue,
      sourceCopy,
    },
    outputArtifactSummary: {
      artifactReferences: [
        {
          artifactKind: fixture.artifactKind,
          path: `_bmad-output/provider-raw-output-ui/${fixture.caseId}.json`,
          rawPayloadStored: false,
          operatorReviewRequired: true,
        },
      ],
      rawOutputStored: false,
    },
  };
  const script = [
    "import json, sqlite3, sys, uuid",
    "from datetime import datetime, timezone",
    "db_path, work_item_id, payload_json = sys.argv[1:4]",
    "conn = sqlite3.connect(db_path)",
    "conn.execute(\"insert into workflow_events (id, work_item_id, event_type, actor_type, actor_id, actor_label, correlation_id, summary, payload, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\", (str(uuid.uuid4()), work_item_id, 'execution_attempt.verification_recorded', 'supervisor', None, None, str(uuid.uuid4()), 'Provider raw-output UI regression fixture recorded with bounded metadata.', payload_json, datetime.now(timezone.utc).isoformat()))",
    "conn.commit()",
    "conn.close()",
  ].join("; ");
  const pythonPath = "services/supervisor/.venv/bin/python";
  execFileSync(pythonPath, ["-c", script, dbPath!, workItemId, JSON.stringify(payload)], {
    cwd: process.cwd(),
  });
}

function gitOutput(args: string[]) {
  return execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8" }).trim();
}

test.describe("dashboard workflow coverage", () => {
  test("shows proposed work empty state and promotes approved work", async ({ page, request }) => {
    const eventStreamRequest = page.waitForRequest((streamRequest) => streamRequest.url().endsWith("/events"));
    await page.goto("/proposed-work");
    await eventStreamRequest;

    await expect(page.getByRole("heading", { name: "Ideas waiting at the front door" })).toBeVisible();
    const existingCandidateCount = await page.locator("article").count();
    if (existingCandidateCount === 0) {
      await expect(page.getByText("No proposed work yet")).toBeVisible();
      await expect(page.getByText("BMAD plans, Chief of Staff requests, Dev Console ideas, and system suggestions")).toBeVisible();
    }

    await createCandidateWork(request, {
      title: "Review Story 6.4 parser",
      requestedOutcome: "Decide whether the BMAD import parser should enter the active work pipeline.",
      source: "bmad",
      sourceArtifactPath: "docs/workflows/implementation-evidence-boundary.md",
      sourceArtifactType: "bmad_story",
      riskLevel: "medium",
      priority: "high",
    });

    const candidateCard = page.locator("article").filter({ hasText: "Review Story 6.4 parser" }).first();
    await expect(candidateCard).toBeVisible();
    await expect(candidateCard.getByText("Needs review")).toBeVisible();
    await expect(candidateCard.getByText("BMAD", { exact: true })).toBeVisible();
    await expect(candidateCard.getByText("Medium risk")).toBeVisible();
    await expect(candidateCard.getByText("High priority")).toBeVisible();
    await expect(candidateCard.getByText("docs/workflows/implementation-evidence-boundary.md")).toBeVisible();
    await expect(candidateCard.getByText("Review before active work")).toBeVisible();
    await expect(page.getByRole("link", { name: /Proposed Work/ })).toBeVisible();
    await expect(candidateCard.getByRole("button", { name: "Move earlier" })).toBeVisible();
    await expect(candidateCard.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(candidateCard.getByRole("button", { name: "Move to active work" })).toBeDisabled();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(candidateCard).toBeVisible();
    await expect(candidateCard.getByText("docs/workflows/implementation-evidence-boundary.md")).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
      )
      .toBeTruthy();


    await candidateCard.getByRole("button", { name: "Approve" }).click();
    const approvedCard = page.locator("article").filter({ hasText: "Review Story 6.4 parser" }).first();
    await expect(approvedCard.getByText("Approved")).toBeVisible();
    await expect(approvedCard.getByRole("button", { name: "Move to active work" })).toBeEnabled();
    await approvedCard.getByRole("button", { name: "Move to active work" }).click();
    await expect(page).toHaveURL(/\/work-items\/.+/);
    await expect(page.getByText("Promote proposed work", { exact: false })).toHaveCount(0);
  });

  test("shows supervisor-owned recipe details during intake", async ({ page }) => {
    await page.goto("/controls");

    const intake = page.locator("section").filter({ hasText: "Start next work" }).first();
    await intake.getByRole("button", { name: "Expand dashboard coverage" }).click();
    await expect(intake.getByText("Template selected: Expand dashboard coverage. Fill in the blanks and launch the work.")).toBeVisible();
    await expect(intake.getByText("Recipe: Dashboard test coverage")).toBeVisible();
    await expect(intake.getByText("Branch: e2e-*")).toBeVisible();
    await expect(intake.getByText("blocked", { exact: true })).toBeVisible();
    await expect(intake.getByText(/pnpm run test:e2e:dashboard/)).toBeVisible();
  });

  test("opens fixture-backed pipeline cockpit without live execution framing", async ({ page, baseURL }, testInfo) => {
    testInfo.setTimeout(90_000);
    const dashboardOrigin = new URL(baseURL ?? "http://127.0.0.1:3000").origin;
    const supervisorOrigin = new URL(supervisorUrl).origin;
    const liveSupervisorRequests: string[] = [];
    const sameOriginRuntimeRequests: string[] = [];
    const forbiddenExternalRequests: string[] = [];
    page.on("request", (request) => {
      const requestUrl = request.url();
      const parsedRequestUrl = new URL(requestUrl);
      if (parsedRequestUrl.origin === supervisorOrigin) {
        liveSupervisorRequests.push(requestUrl);
      }
      if (
        parsedRequestUrl.origin === dashboardOrigin &&
        /^\/(api|supervisor|provider|worker|obsidian|github|ollama|claude|execution|runtime)(\/|$)/i.test(parsedRequestUrl.pathname)
      ) {
        sameOriginRuntimeRequests.push(requestUrl);
      }
      const forbiddenProviderHost =
        parsedRequestUrl.hostname === "api.openai.com" ||
        parsedRequestUrl.hostname.endsWith(".openai.com") ||
        parsedRequestUrl.hostname === "api.anthropic.com" ||
        parsedRequestUrl.hostname.endsWith(".anthropic.com") ||
        parsedRequestUrl.hostname === "claude.ai" ||
        parsedRequestUrl.hostname.endsWith(".claude.ai") ||
        parsedRequestUrl.hostname === "github.com" ||
        parsedRequestUrl.hostname.endsWith(".github.com") ||
        parsedRequestUrl.hostname.toLowerCase().includes("obsidian") ||
        ((parsedRequestUrl.hostname === "localhost" || parsedRequestUrl.hostname === "127.0.0.1") && parsedRequestUrl.port === "11434");
      if (forbiddenProviderHost) {
        forbiddenExternalRequests.push(requestUrl);
      }
    });

    await page.goto("/pipeline");

    await expect(page.getByRole("navigation", { name: "Dashboard sections" })).toBeVisible();
    const pageMenu = page.locator(".dashboard-page-menu-summary");
    await expect(pageMenu).toBeVisible();
    await expect(pageMenu.locator(".dashboard-page-menu-icon span")).toHaveCount(3);
    const compactHeaderEvidence = await page.evaluate(() => {
      const menu = document.querySelector(".dashboard-page-menu-summary");
      const shellHeading = Array.from(document.querySelectorAll("h1")).find((heading) =>
        heading.textContent?.includes("Kendall Supervisor")
      );
      const menuRect = menu?.getBoundingClientRect();
      const headingRect = shellHeading?.getBoundingClientRect();
      const overlapsHeading = Boolean(
        menuRect &&
        headingRect &&
        menuRect.left < headingRect.right &&
        menuRect.right > headingRect.left &&
        menuRect.top < headingRect.bottom &&
        menuRect.bottom > headingRect.top
      );
      return {
        menuIsIconOnly: menu?.textContent?.trim() === "",
        menuIsBottomLeft: Boolean(menuRect && menuRect.left <= 24 && menuRect.bottom >= window.innerHeight - 24),
        menuIsTopRight: Boolean(menuRect && menuRect.right >= window.innerWidth - 24 && menuRect.top <= 24),
        overlapsHeading,
        viewportWidth: window.innerWidth,
      };
    });
    expect(compactHeaderEvidence.menuIsIconOnly).toBe(true);
    if (compactHeaderEvidence.viewportWidth <= 720) {
      expect(compactHeaderEvidence.menuIsBottomLeft).toBe(true);
    } else {
      expect(compactHeaderEvidence.menuIsTopRight).toBe(true);
      expect(compactHeaderEvidence.overlapsHeading).toBe(false);
    }
    await pageMenu.click();
    await expect(page.locator("nav a[href=\"/settings\"]")).toBeVisible();
    await expect(page.locator("nav a[href=\"/pipeline\"]")).toHaveAttribute("aria-current", "page");
    for (const menuLabel of ["Monitor", "Watch state", "Evidence", "Inspect records", "Deliberate", "Control setup"]) {
      await expect(page.getByRole("navigation", { name: "Dashboard sections" }).getByText(menuLabel, { exact: true })).toBeVisible();
    }
    await pageMenu.click();
    const cockpit = page.getByRole("main", { name: "Pipeline cockpit" });
    await expect(cockpit).toBeVisible();
    const refinedFrame = page.getByLabel("Refined pipeline cockpit frame");
    await expect(refinedFrame).toBeVisible();
    const firstFrame = page.getByLabel("Cockpit first-frame hierarchy");
    await expect(firstFrame).toBeVisible();
    await expect(firstFrame.getByRole("heading", { name: "Pipeline", exact: true })).toBeVisible();
    await expect(firstFrame.getByText("manual", { exact: true })).toHaveCount(0);
    await expect(firstFrame.getByText("Mission route map", { exact: true })).toHaveCount(0);
    await expect(firstFrame.getByText("From idea to shipped", { exact: true })).toHaveCount(0);
    await expect(firstFrame.getByText("dev branch", { exact: true })).toHaveCount(0);
    await expect(firstFrame.getByText("no live calls", { exact: true })).toHaveCount(0);
    const commandStrip = page.getByLabel("Pipeline command strip");
    await expect(commandStrip).toBeVisible();
    await expect(page.getByLabel("Operator command center")).toBeVisible();
    await expect(commandStrip.getByLabel(/Active packets:/)).toHaveCount(0);
    await expect(commandStrip.getByLabel(/Blocked gates:/)).toHaveCount(0);
    await expect(commandStrip.getByLabel("Provider approval: disabled", { exact: true })).toHaveCount(0);
    await expect(commandStrip.getByLabel("Top blocked packet: Approve bounded cockpit fixture plan", { exact: true })).toBeVisible();
    await expect(commandStrip.getByLabel(/Global recovery:/)).toHaveCount(0);
    await expect(page.getByLabel("Pipeline workflow strip")).toHaveCount(0);
    await expect(page.getByLabel("Pipeline mobile workflow strip")).toHaveCount(0);
    await expect(page.getByText("Idea captured", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Review ready", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Promote candidate", { exact: true })).toHaveCount(0);
    const packetSearch = commandStrip.getByLabel("Packet search", { exact: true });
    await expect(packetSearch).toBeVisible();
    await expect(page.getByLabel("Fixture scenario selector")).toHaveCount(0);
    await expect(page.getByLabel("Golden path lifecycle")).toHaveCount(0);
    await expect(page.getByLabel("Pipeline source rail", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Active packet drawer")).toHaveCount(0);
    await expect(page.getByLabel("Pipeline evidence strip")).toHaveCount(0);
    await expect(page.getByLabel("Pipeline orientation summary")).toHaveCount(0);
    const pipelineBoard = page.getByLabel("Pipeline board");
    await expect(pipelineBoard).toBeVisible();
    await expect(page.getByLabel("NohypeAI inspired workflow map")).toHaveCount(0);
    await expect(page.getByLabel("Deep Review and artifact stack")).toHaveCount(0);
    await expect(pipelineBoard.getByText("Route map", { exact: true })).toBeVisible();
    await expect(pipelineBoard.locator(".kendall-info-tip")).toHaveCount(1);
    await expect(pipelineBoard.locator(".kendall-info-tip-icon").first()).toHaveText("i");
    await expect(pipelineBoard.locator(".kendall-info-tip-bubble").first()).toHaveText("Each stage shows packets currently sitting there. Color marks state; order puts urgent work first.");
    await expect(pipelineBoard.getByText("map view", { exact: true })).toHaveCount(0);
    const statusKey = page.getByLabel("Pipeline status key");
    await expect(statusKey).toBeVisible();
    for (const statusLabel of ["Active", "Waiting", "Needs approval", "Blocked", "Complete"]) {
      await expect(statusKey.getByText(statusLabel, { exact: true })).toBeVisible();
    }
    const operationalStrip = page.getByLabel("Pipeline operational strip");
    await expect(operationalStrip).toBeVisible();
    const capacityStrip = page.getByLabel("Pipeline capacity strip");
    await expect(capacityStrip).toBeVisible();
    await expect(capacityStrip.getByText("Codex", { exact: true })).toBeVisible();
    await expect(capacityStrip.getByText("Claude", { exact: true })).toBeVisible();
    await expect(capacityStrip.getByText("5h", { exact: true })).toHaveCount(2);
    await expect(capacityStrip.getByText("Weekly", { exact: true })).toHaveCount(2);
    await expect(capacityStrip.getByText("not connected", { exact: true })).toHaveCount(0);
    await expect(capacityStrip.getByText("Connect read-only usage source", { exact: true })).toHaveCount(0);
    await expect(capacityStrip.locator(".pipeline-usage-warning-icon")).toHaveCount(2);
    await expect(capacityStrip.locator(".pipeline-usage-meter-fill")).toHaveCount(4);
    const missionStrip = page.getByLabel("Mission control focus strip");
    await expect(missionStrip).toBeVisible();
    await expect(missionStrip.getByText("Most urgent", { exact: true })).toBeVisible();
    await expect(missionStrip.getByText("State", { exact: true })).toBeVisible();
    await expect(missionStrip.getByText("Gate", { exact: true })).toBeVisible();
    const routeMap = page.getByLabel("Pipeline route map");
    await expect(routeMap).toBeVisible();
    await expect(routeMap.locator(".pipeline-route-station")).toHaveCount(10);
    await expect(routeMap.locator(".pipeline-route-connectors")).toBeVisible();
    await expect(routeMap.locator(".pipeline-route-connector-line")).toHaveCount(9);
    await expect(routeMap.locator(".pipeline-route-connector-pulse")).toHaveCount(9);
    await expect(page.getByLabel("Pipeline inspection panel")).toHaveCount(0);
    await expect(page.getByLabel("Packet inspection panel")).toHaveCount(0);
    await expect(page.getByLabel("Stage inspection panel")).toHaveCount(0);
    const compactPacketCount = await routeMap.locator("button[aria-label^=\"Inspect packet:\"]").count();
    expect(compactPacketCount).toBeGreaterThan(0);
    expect(compactPacketCount).toBeLessThanOrEqual(40);
    const executeStation = routeMap.locator(".pipeline-route-station").filter({
      has: page.getByRole("button", { name: "Execute", exact: true }),
    });
    const executeOverflow = executeStation.locator(".pipeline-more-packets").first();
    await expect(executeOverflow).toBeVisible();
    await executeOverflow.click();
    await expect(executeStation.locator(".pipeline-more-packets")).toHaveCount(0);
    expect(await executeStation.locator("button[aria-label^=\"Inspect packet:\"]").count()).toBeGreaterThan(4);
    const lastExecutePacket = executeStation.locator("button[aria-label^=\"Inspect packet:\"]").last();
    await lastExecutePacket.click();
    await expect(lastExecutePacket).toHaveAttribute("aria-pressed", "true");
    await expect(executeStation.locator(".pipeline-more-packets")).toHaveCount(0);
    expect(await executeStation.locator("button[aria-label^=\"Inspect packet:\"]").count()).toBeGreaterThan(4);
    await expect(routeMap.getByRole("button", { name: "Needs approval", exact: true })).toBeVisible();
    await expect(routeMap.locator(".pipeline-stage-info-icon")).toHaveCount(10);
    const captureStage = routeMap.getByRole("button", { name: "Capture", exact: true });
    await captureStage.hover();
    await captureStage.focus();
    await captureStage.click();
    const captureStageBubble = captureStage.locator(".pipeline-stage-info-bubble");
    await expect(captureStageBubble).toHaveText("New ideas and requests land here before Kendall decides what they are.");
    await expect(captureStageBubble).toBeVisible();
    const captureTooltipEvidence = await captureStageBubble.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const clippingAncestors = [];
      let parent = element.parentElement;
      while (parent) {
        const parentStyle = window.getComputedStyle(parent);
        const clipsX = parentStyle.overflowX === "hidden" || parentStyle.overflowX === "clip";
        const clipsY = parentStyle.overflowY === "hidden" || parentStyle.overflowY === "clip";
        if (clipsX || clipsY) {
          const parentRect = parent.getBoundingClientRect();
          clippingAncestors.push({
            clipped:
              (clipsX && (rect.left < parentRect.left - 1 || rect.right > parentRect.right + 1)) ||
              (clipsY && (rect.top < parentRect.top - 1 || rect.bottom > parentRect.bottom + 1)),
            overflowX: parentStyle.overflowX,
            overflowY: parentStyle.overflowY,
          });
        }
        parent = parent.parentElement;
      }
      return {
        unclippedByContainers: clippingAncestors.every((ancestor) => !ancestor.clipped),
      };
    });
    expect(captureTooltipEvidence).toMatchObject({ unclippedByContainers: true });
    await expect(routeMap.getByText(/needs approval|blocked|stale source|waiting|low-risk packet/).first()).toBeVisible();
    await pipelineBoard.focus();
    await page.keyboard.press("Slash");
    if (!(await packetSearch.evaluate((element) => element === document.activeElement))) {
      await packetSearch.focus();
    }
    await expect(packetSearch).toBeFocused();
    await packetSearch.fill("stale");
    const stalePacketButton = routeMap.getByRole("button", { name: /Inspect packet: Resolve stale research source before routing/ });
    await expect(stalePacketButton).toBeVisible();
    await packetSearch.fill("");
    await packetSearch.fill("Recover failed");
    const failedPacketButton = routeMap.getByRole("button", { name: /Inspect packet: Recover failed worker stage/ });
    await expect(failedPacketButton).toBeVisible();
    await failedPacketButton.click();
    const failedInspection = page.getByLabel("Packet inspection panel");
    await expect(failedInspection).toBeVisible();
    await expect(failedInspection.getByText("Next", { exact: true })).toBeVisible();
    await expect(failedInspection.getByText("Recovery", { exact: true })).toBeVisible();
    await failedPacketButton.click();
    await expect(page.getByLabel("Packet inspection panel")).toHaveCount(0);
    await packetSearch.fill("hermes.governed");
    const governedHermesPacketButton = routeMap.getByRole("button", { name: /Inspect packet: Governed Hermes dry-run attempt active/ });
    await expect(governedHermesPacketButton).toBeVisible();
    await governedHermesPacketButton.click();
    const governedHermesInspection = page.getByLabel("Packet inspection panel");
    await expect(governedHermesInspection).toBeVisible();
    await expect(governedHermesInspection.getByLabel("Execution attempts")).toBeVisible();
    await expect(governedHermesInspection.getByText("hermes.governed.dry_run", { exact: false })).toBeVisible();
    await expect(governedHermesInspection.getByText("authority mode non_executing_dry_run", { exact: false })).toBeVisible();
    await expect(governedHermesInspection.getByText("retention metadata_only", { exact: false })).toBeVisible();
    await expect(governedHermesInspection.getByText("rawPayloadRetained false", { exact: false })).toBeVisible();
    await governedHermesPacketButton.click();
    await expect(page.getByLabel("Packet inspection panel")).toHaveCount(0);
    await packetSearch.fill("");
    for (const stage of ["Capture", "Classify", "Route", "Shape", "Needs approval", "Execute", "Review", "Promote", "Deliver", "Learn"]) {
      await expect(routeMap.getByRole("button", { name: stage, exact: true })).toHaveCount(1);
    }
    await routeMap.getByRole("button", { name: "Needs approval", exact: true }).click();
    await expect(page.getByLabel("Stage inspection panel")).toHaveCount(0);
    await expect(page.getByLabel("Packet inspection panel")).toHaveCount(0);
    await routeMap.getByRole("button", { name: "Route", exact: true }).click();
    await expect(page.getByLabel("Stage inspection panel")).toHaveCount(0);
    await packetSearch.fill("stale");
    await stalePacketButton.evaluate((element) => element.scrollIntoView({ block: "center", inline: "center" }));
    await stalePacketButton.click();
    const packetInspection = page.getByLabel("Packet inspection panel");
    await expect(packetInspection).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const routeRect = document.querySelector('[aria-label="Pipeline route map"]')?.getBoundingClientRect();
          const drawerRect = document.querySelector('[aria-label="Packet inspection panel"]')?.getBoundingClientRect();
          return Boolean(routeRect && drawerRect && drawerRect.top >= routeRect.bottom - 1);
        })
      )
      .toBeTruthy();
    await stalePacketButton.click();
    await expect(page.getByLabel("Packet inspection panel")).toHaveCount(0);
    await stalePacketButton.click();
    await expect(packetInspection).toBeVisible();
    await expect(packetInspection.getByRole("heading", { name: "Resolve stale research source before routing", exact: true })).toBeVisible();
    await expect(packetInspection.getByLabel("Packet plain-language summary")).toBeVisible();
    for (const inspectionLabel of ["Where", "Came from", "Got here", "Next", "Blocked by"]) {
      await expect(packetInspection.getByText(inspectionLabel, { exact: true })).toBeVisible();
    }
    await expect(packetInspection.getByText("Captured intake", { exact: true })).toBeVisible();
    await expect(packetInspection.getByText("Being sorted", { exact: true })).toBeVisible();
    await expect(packetInspection.getByText("Research or source review", { exact: true })).toBeVisible();
    await expect(packetInspection.getByText("Source freshness needs review", { exact: true })).toBeVisible();
    await packetInspection.getByRole("link", { name: "Open full packet", exact: true }).click();
    await expect(page).toHaveURL(/\/pipeline\/packets\/fixture%3Astale-source|\/pipeline\/packets\/fixture:stale-source/);
    const packetDetail = page.getByRole("main", { name: "Packet detail" });
    await expect(packetDetail).toBeVisible();
    await expect(packetDetail.getByRole("heading", { name: "Packet detail: Resolve stale research source before routing" })).toBeVisible();
    await expect(packetDetail.getByLabel("Packet 5 Whys")).toBeVisible();
    for (const fiveWhyLabel of [
      "What is this?",
      "Why is it here?",
      "Where is it?",
      "What proof exists?",
      "What happens next?",
    ]) {
      await expect(packetDetail.getByText(fiveWhyLabel, { exact: true })).toBeVisible();
    }
    await expect(packetDetail.getByRole("heading", { name: "Route", exact: true })).toBeVisible();
    await expect(packetDetail.getByText("Selected route", { exact: true })).toBeVisible();
    await expect(packetDetail.getByText("Rejected routes", { exact: true })).toBeVisible();
    await expect(packetDetail.getByRole("heading", { name: "Evidence and artifacts", exact: true })).toBeVisible();
    await expect(packetDetail.getByRole("heading", { name: "Workers and review", exact: true })).toBeVisible();
    await expect(packetDetail.getByRole("heading", { name: "Gate, memory, recovery", exact: true })).toBeVisible();
    await expect(packetDetail.getByLabel("Packet source boundaries")).toBeVisible();
    await expect(packetDetail.getByText("Source Boundary Checklist", { exact: true })).toBeVisible();
    await expect(packetDetail.getByText("Obsidian is canonical and human-owned", { exact: false }).first()).toBeVisible();
    await packetDetail.getByRole("link", { name: "Back to pipeline", exact: true }).click();
    await expect(page).toHaveURL(/\/pipeline$/);
    await page.goto("/pipeline/packets/fixture:human-gate-blocked");
    const gatePacketDetail = page.getByRole("main", { name: "Packet detail" });
    await expect(gatePacketDetail).toBeVisible();
    await expect(gatePacketDetail.getByText("required evidence:", { exact: false }).first()).toBeVisible();
    await expect(gatePacketDetail.getByText("stop lines:", { exact: false }).first()).toBeVisible();
    await expect(gatePacketDetail.getByText("Do not launch a real worker from fixture mode.", { exact: false })).toBeVisible();
    await expect(gatePacketDetail.getByText("rollback:", { exact: false }).first()).toBeVisible();
    await expect(gatePacketDetail.getByText("audit:", { exact: false }).first()).toBeVisible();
    await gatePacketDetail.getByRole("link", { name: "Back to pipeline", exact: true }).click();
    await expect(page).toHaveURL(/\/pipeline$/);
    await page.goto("/pipeline/packets/fixture:learn-memory");
    const memoryPacketDetail = page.getByRole("main", { name: "Packet detail" });
    await expect(memoryPacketDetail).toBeVisible();
    await expect(memoryPacketDetail.getByText("proposal type:", { exact: false }).first()).toBeVisible();
    await expect(memoryPacketDetail.getByText("sensitivity:", { exact: false }).first()).toBeVisible();
    await expect(memoryPacketDetail.getByText("contradiction:", { exact: false }).first()).toBeVisible();
    await expect(memoryPacketDetail.getByText("write-back allowed: false", { exact: false }).first()).toBeVisible();
    await expect(memoryPacketDetail.getByText("write-back status:", { exact: false }).first()).toBeVisible();
    await page.goto("/pipeline/packets/fixture:failed-stage");
    const recoveryPacketDetail = page.getByRole("main", { name: "Packet detail" });
    await expect(recoveryPacketDetail).toBeVisible();
    await expect(recoveryPacketDetail.getByText("guard classification:", { exact: false }).first()).toBeVisible();
    await expect(recoveryPacketDetail.getByText("expected binding:", { exact: false }).first()).toBeVisible();
    await expect(recoveryPacketDetail.getByText("actual binding:", { exact: false }).first()).toBeVisible();
    await expect(recoveryPacketDetail.getByText("primary risk:", { exact: false }).first()).toBeVisible();
    await expect(recoveryPacketDetail.getByText("stop line:", { exact: false }).first()).toBeVisible();
    await expect(recoveryPacketDetail.getByText("safe next option:", { exact: false }).first()).toBeVisible();
    await expect(recoveryPacketDetail.getByText("fixture event:", { exact: false }).first()).toBeVisible();
    await recoveryPacketDetail.getByRole("link", { name: "Back to pipeline", exact: true }).click();
    await expect(page).toHaveURL(/\/pipeline$/);
    await expect(pipelineBoard).toBeVisible();
    await expect(cockpit.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
    for (const viewport of [pipelineViewportForProject(testInfo.project.name)] as const) {
      await page.setViewportSize(viewport);
      await expect(commandStrip).toBeVisible();
      await expect(pipelineBoard).toBeVisible();
      await expect(routeMap).toBeVisible();
      await expect(page.getByLabel(/inspection panel/i)).toHaveCount(0);
      const visiblePacketCount = await routeMap.locator("button[aria-label^=\"Inspect packet:\"]:visible").count();
      expect(visiblePacketCount, JSON.stringify({ viewport, visiblePacketCount })).toBeGreaterThan(0);
      expect(visiblePacketCount, JSON.stringify({ viewport, visiblePacketCount })).toBeLessThanOrEqual(40);
      const mobileRouteEvidence = await page.evaluate(() => {
        const routeMap = document.querySelector('[aria-label="Pipeline route map"]');
        const routeMapStyle = routeMap ? window.getComputedStyle(routeMap) : null;
        const maxVisiblePacketsPerStage = Math.max(
          0,
          ...Array.from(document.querySelectorAll(".pipeline-route-station")).map((station) =>
            Array.from(station.querySelectorAll(".pipeline-mini-packet")).filter((packet) => {
              const style = window.getComputedStyle(packet);
              return style.display !== "none" && style.visibility !== "hidden";
            }).length
          )
        );
        return {
          miniPacketLabelsSingleLine: Array.from(document.querySelectorAll(".pipeline-mini-packet-label")).every((label) => {
            const style = window.getComputedStyle(label);
            const lineHeight = Number.parseFloat(style.lineHeight);
            const maxSingleLineHeight = Number.isFinite(lineHeight) ? lineHeight * 1.35 : 24;
            return style.whiteSpace === "nowrap" && label.getBoundingClientRect().height <= maxSingleLineHeight;
          }),
          stageLabelsUntruncated: Array.from(document.querySelectorAll(".pipeline-stage-label")).every((label) => {
            const htmlLabel = label as HTMLElement;
            return htmlLabel.scrollWidth <= htmlLabel.clientWidth + 1;
          }),
          routeMapHasHorizontalScroll: routeMap && routeMapStyle?.overflowX !== "visible" ? routeMap.scrollWidth > routeMap.clientWidth + 8 : false,
          maxVisiblePacketsPerStage,
          stageCardsHaveVisibleFrames: Array.from(document.querySelectorAll(".pipeline-route-station")).every((station) => {
            const style = window.getComputedStyle(station);
            return style.borderStyle !== "none" && style.backgroundImage !== "none";
          }),
        };
      });
      if (viewport.width <= 720) {
        expect(mobileRouteEvidence, JSON.stringify({ viewport, mobileRouteEvidence })).toMatchObject({
          routeMapHasHorizontalScroll: false,
        });
        expect(mobileRouteEvidence.maxVisiblePacketsPerStage, JSON.stringify({ viewport, mobileRouteEvidence })).toBeLessThanOrEqual(3);
      } else {
        expect(mobileRouteEvidence.routeMapHasHorizontalScroll, JSON.stringify({ viewport, mobileRouteEvidence })).toBe(false);
        expect(mobileRouteEvidence.maxVisiblePacketsPerStage, JSON.stringify({ viewport, mobileRouteEvidence })).toBeLessThanOrEqual(4);
      }
      expect(mobileRouteEvidence.miniPacketLabelsSingleLine, JSON.stringify({ viewport, mobileRouteEvidence })).toBe(true);
      expect(mobileRouteEvidence.stageLabelsUntruncated, JSON.stringify({ viewport, mobileRouteEvidence })).toBe(true);
      expect(mobileRouteEvidence.stageCardsHaveVisibleFrames, JSON.stringify({ viewport, mobileRouteEvidence })).toBe(true);
      const visualIntegrityEvidence = await page.evaluate(() => {
        const checkSelectors = [
          '[aria-label="Pipeline command strip"]',
          '[aria-label="Pipeline operational strip"]',
          '[aria-label="Mission control focus strip"]',
          '[aria-label="Pipeline board"]',
          '[aria-label="Pipeline route map"]',
          '[aria-label$="inspection panel"]',
        ];
        const boxes = checkSelectors.flatMap((selector) =>
          Array.from(document.querySelectorAll(selector))
            .filter((element) => {
              const style = window.getComputedStyle(element);
              return style.display !== "none" && style.visibility !== "hidden";
            })
            .map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                label: element.getAttribute("aria-label") ?? selector,
                height: Math.round(rect.height),
                width: Math.round(rect.width),
              };
            })
        );
        const crampedBoxes = boxes.filter((box) => box.width < 120 || box.height < 24);
        const overflowingText = Array.from(document.querySelectorAll("button, span, p, h1, h2, h3, h4, dd, dt"))
          .filter((element) => !element.classList.contains("sr-only"))
          .filter((element) => !element.classList.contains("pipeline-mini-packet-label"))
          .filter((element) => !element.classList.contains("kendall-info-tip"))
          .map((element) => {
            const htmlElement = element as HTMLElement;
            const rect = htmlElement.getBoundingClientRect();
            return {
              text: htmlElement.textContent?.trim().slice(0, 48) ?? htmlElement.tagName,
              clientWidth: Math.round(htmlElement.clientWidth),
              scrollWidth: Math.round(htmlElement.scrollWidth),
              width: Math.round(rect.width),
            };
          })
          .filter((entry) => entry.scrollWidth > entry.clientWidth + 8)
          .slice(0, 8);
        return {
          boxes,
          crampedBoxes,
          overflowingText,
        };
      });
      expect(visualIntegrityEvidence, JSON.stringify({ viewport, visualIntegrityEvidence })).toMatchObject({
        crampedBoxes: [],
        overflowingText: [],
      });
      const overflowEvidence = await page.evaluate(() => {
        const viewportWidth = window.innerWidth;
        const documentWidth = document.documentElement.scrollWidth;
        const offenders = Array.from(document.querySelectorAll("body *"))
          .filter((element) => {
            if (element.closest(".kendall-graph-background")) {
              return false;
            }
            let current = element.parentElement;
            while (current !== null) {
              const style = window.getComputedStyle(current);
              if (
                (current.getAttribute("aria-label") === "Pipeline route map" || current.getAttribute("aria-label") === "Dashboard sections")
                && (style.overflowX === "auto" || style.overflowX === "scroll")
                && current.scrollWidth > current.clientWidth + 8
              ) {
                return false;
              }
              current = current.parentElement;
            }
            return true;
          })
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              label: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 48) ?? element.tagName,
              tag: element.tagName,
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
            };
          })
          .filter((entry) => entry.left < -24 || entry.right > viewportWidth + 24)
          .slice(0, 5);
        return {
          viewportWidth,
          documentWidth,
          hasPageOverflow: offenders.length > 0,
          offenders,
        };
      });
      expect(overflowEvidence, JSON.stringify({ viewport, overflowEvidence })).toMatchObject({ hasPageOverflow: false });
      const motionContract = await page.evaluate(() => {
        const graphBackground = document.querySelector(".kendall-graph-background");
        const graphLink = document.querySelector(".kendall-graph-background__links path");
        const graphMap = document.querySelector(".kendall-graph-background__map");
        const graphNode = document.querySelector(".kendall-graph-background__nodes circle");
        const shell = document.querySelector(".pipeline-nohype-shell");
        const routeMap = document.querySelector(".pipeline-route-map");
        const routeRow = document.querySelector(".pipeline-route-row");
        const routeConnector = document.querySelector(".pipeline-route-connector-line");
        const routeConnectorPulse = document.querySelector(".pipeline-route-connector-pulse");
        const missionStrip = document.querySelector(".pipeline-mission-strip");
        const stageCode = document.querySelector(".pipeline-stage-code");
        const miniPacket = document.querySelector(".pipeline-mini-packet");
        const inspectionPanel = document.querySelector(".pipeline-inspection-panel");
        const connectorStyle = routeConnector ? window.getComputedStyle(routeConnector) : null;
        const connectorPulseStyle = routeConnectorPulse ? window.getComputedStyle(routeConnectorPulse) : null;
        const graphBackgroundStyle = graphBackground ? window.getComputedStyle(graphBackground) : null;
        const graphLinkStyle = graphLink ? window.getComputedStyle(graphLink) : null;
        const graphMapStyle = graphMap ? window.getComputedStyle(graphMap) : null;
        const graphNodeStyle = graphNode ? window.getComputedStyle(graphNode) : null;
        const shellSignalStyle = shell ? window.getComputedStyle(shell, "::before") : null;
        const slowestAnimationSeconds = (animationDuration: string | undefined) => {
          const durations = String(animationDuration ?? "")
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean)
              .map((value) => value.endsWith("ms") ? Number.parseFloat(value) / 1000 : Number.parseFloat(value))
              .filter((value) => Number.isFinite(value) && value > 0);
          return durations.length === 0 ? 0 : Math.min(...durations);
        };
        return {
          hasGraphBackground: graphBackground !== null,
          graphBackgroundFixed: graphBackgroundStyle?.position === "fixed",
          graphBackgroundBehindContent: graphBackgroundStyle?.zIndex === "0",
          graphLinkAnimated: graphLinkStyle?.animationName === "kendall-link-flow",
          graphLinkSlow: slowestAnimationSeconds(graphLinkStyle?.animationDuration) >= 30,
          graphMapAnimated: graphMapStyle?.animationName === "kendall-graph-drift",
          graphMapSlow: slowestAnimationSeconds(graphMapStyle?.animationDuration) >= 72,
          graphNodeAnimated: graphNodeStyle?.animationName === "kendall-node-pulse",
          graphNodeSlow: slowestAnimationSeconds(graphNodeStyle?.animationDuration) >= 15,
          hasShell: shell !== null,
          hasRouteMap: routeMap !== null,
          routeMapClipsMotion: routeMap ? window.getComputedStyle(routeMap).overflow === "hidden" : false,
          routeMapUnframed: routeMap ? window.getComputedStyle(routeMap).borderWidth === "0px" : false,
          hasRouteRow: routeRow !== null,
          hasMissionStrip: missionStrip !== null,
          hasStageCodes: stageCode !== null,
          hasMiniPacket: miniPacket !== null,
          hidesInspectionPanelUntilPacketSelect: inspectionPanel === null,
          hasRouteConnector: connectorStyle !== null && routeConnector?.getAttribute("d")?.startsWith("M ") === true,
          routeConnectorAnimated: connectorPulseStyle?.animationName === "pipeline-route-flow",
          routeConnectorSlow: slowestAnimationSeconds(connectorPulseStyle?.animationDuration) >= 9,
          routeConnectorMoves: connectorPulseStyle?.strokeDasharray !== "none",
          shellSignalAnimated: shellSignalStyle?.animationName === "pipeline-shell-drift",
          shellSignalSlow: slowestAnimationSeconds(shellSignalStyle?.animationDuration) >= 60,
          shellOverflow: shell ? window.getComputedStyle(shell).overflow : null,
        };
      });
      expect(motionContract).toMatchObject({
        hasGraphBackground: true,
        graphBackgroundFixed: true,
        graphBackgroundBehindContent: true,
        graphLinkAnimated: true,
        graphLinkSlow: true,
        graphMapAnimated: true,
        graphMapSlow: true,
        graphNodeAnimated: true,
        graphNodeSlow: true,
        hasShell: true,
        hasRouteMap: true,
        routeMapClipsMotion: false,
        routeMapUnframed: true,
        hasRouteRow: true,
        hasMissionStrip: true,
        hasStageCodes: true,
        hasMiniPacket: true,
        hidesInspectionPanelUntilPacketSelect: true,
        hasRouteConnector: true,
        routeConnectorAnimated: true,
        routeConnectorSlow: true,
        routeConnectorMoves: true,
        shellSignalAnimated: true,
        shellSignalSlow: true,
        shellOverflow: "visible",
      });
      await page.screenshot({
        fullPage: true,
        path: `test-results/pipeline-refined-${testInfo.project.name}.png`,
      });
    }
    await page.waitForLoadState("networkidle");
    await expect
      .poll(() => liveSupervisorRequests.length + sameOriginRuntimeRequests.length + forbiddenExternalRequests.length, { timeout: 2_000 })
      .toBe(0);
    expect(liveSupervisorRequests).toEqual([]);
    expect(sameOriginRuntimeRequests).toEqual([]);
    expect(forbiddenExternalRequests).toEqual([]);
  });

  test("opens settings with usage source configuration placeholders", async ({ page }) => {
    await page.goto("/settings");

    await expect(page.getByRole("navigation", { name: "Dashboard sections" })).toBeVisible();
    const settingsMenu = page.locator(".dashboard-page-menu-summary");
    await settingsMenu.click();
    await expect(page.locator("nav a[href=\"/settings\"]")).toHaveAttribute("aria-current", "page");
    await settingsMenu.click();
    await expect(page.getByRole("heading", { name: "Configuration", exact: true })).toBeVisible();
    const settings = page.getByRole("main", { name: "Dashboard settings" });
    await expect(settings).toBeVisible();
    await expect(settings.getByLabel("Usage source settings")).toBeVisible();
    await expect(settings.getByText("Codex and Claude limits", { exact: true })).toBeVisible();
    await expect(settings.getByText("Codex", { exact: true })).toBeVisible();
    await expect(settings.getByText("Claude", { exact: true })).toBeVisible();
    await expect(settings.getByText("No read-only source selected", { exact: true })).toHaveCount(2);
    await expect(settings.getByText("ccusage local summary", { exact: true })).toHaveCount(2);
    await expect(settings.getByLabel("Usage graph visibility settings")).toBeVisible();
    await expect(settings.getByLabel("Codex usage")).toBeChecked();
    await expect(settings.getByLabel("Claude usage")).toBeChecked();
    await settings.getByLabel("Claude usage").uncheck();
    await expect(settings.getByLabel("Claude usage")).not.toBeChecked();
    await expect(settings.getByText("Do not store provider credentials in dashboard settings", { exact: true })).toBeVisible();
    await expect(settings.getByText("Show unknown usage as not connected", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /connect|save|authorize|login/i })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("main", { name: "Dashboard settings" }).getByLabel("Claude usage")).not.toBeChecked();
    await page.goto("/pipeline");
    const persistedCapacityStrip = page.getByLabel("Pipeline capacity strip");
    await expect(persistedCapacityStrip.getByText("Codex", { exact: true })).toBeVisible();
    await expect(persistedCapacityStrip.getByText("Claude", { exact: true })).toHaveCount(0);
  });

  test("opens to a monitoring-first home without authority-gated action controls", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Dashboard sections" })).toBeVisible();
    const homeMenu = page.locator(".dashboard-page-menu-summary");
    await homeMenu.click();
    await expect(page.getByText("Monitor", { exact: true })).toBeVisible();
    await expect(page.getByText("Watch state", { exact: true })).toBeVisible();
    await expect(page.getByText("Evidence", { exact: true })).toBeVisible();
    await expect(page.getByText("Inspect records", { exact: true })).toBeVisible();
    await expect(page.getByText("Deliberate", { exact: true })).toBeVisible();
    await expect(page.getByText("Control setup", { exact: true })).toBeVisible();
    await expect(page.locator("nav a[href=\"/\"]")).toHaveAttribute("aria-current", "page");
    await expect(page.locator("nav a[href=\"/controls\"]")).toBeVisible();
    await expect(page.locator("nav a[href=\"/settings\"]")).toBeVisible();
    await homeMenu.click();
    await expect(page.getByRole("button", { name: /approve|retry|cleanup|launch|execute|start work|fix a problem/i })).toHaveCount(0);
    await expect(page.getByText("Operations Brief")).toBeVisible();
    const operationsBrief = page.locator("section").filter({ hasText: "Operations Brief" }).first();
    await expect(operationsBrief.getByText(/^(Calm monitoring|Watch active work|Operator review first)$/)).toBeVisible();
    await expect(page.getByText("Scan Order")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Read the board top-down" })).toBeVisible();
    const initialScanOrder = page.locator("section").filter({ hasText: "Read the board top-down" }).first();
    await expect(initialScanOrder.getByRole("link", { name: /Attention/ })).toHaveAttribute("href", "/attention");
    await expect(initialScanOrder.getByRole("link", { name: /Active work/ })).toHaveAttribute("href", "/active-work");
    await expect(initialScanOrder.getByRole("link", { name: /Recent evidence/ })).toHaveAttribute("href", "/queue");
    await expect(initialScanOrder.getByRole("link", { name: /Audit trail/ })).toHaveAttribute("href", "/audit");
    const auditBriefLink = page.getByRole("link", { name: "Open audit" }).first();
    await expect(auditBriefLink).toBeVisible();
    await expect(auditBriefLink).toHaveAttribute("href", "/audit");
    await expect(page.getByText("Operator review first")).toHaveCount(0);

    const workItemId = await createWorkItem(request, {
      title: "Monitoring home attention item",
      requestedOutcome: "Verify the home page presents monitoring and safe drill-in paths.",
      riskLevel: "medium",
    });
    await waitForState(request, workItemId, "implementing");

    await page.goto("/");
    await openCompactDashboardNav(page);
    const activeNavLink = page.locator("nav a[href=\"/active-work\"]");
    await expect(activeNavLink).toBeVisible();
    await expect(activeNavLink).toContainText("Active Work");
    await expect(page.getByText("Watch active work", { exact: true })).toBeVisible();
    const activeBriefLink = page.getByRole("link", { name: "Open active work" });
    await expect(activeBriefLink).toBeVisible();
    await expect(activeBriefLink).toHaveAttribute("href", "/active-work");
    await expect(page.getByText("Operator review first")).toHaveCount(0);

    await escalateWorkItem(request, workItemId, "Approval required before any retry or cleanup.");
    const approvalWorkItemId = await createWorkItem(request, {
      title: "Monitoring home approval next step",
      requestedOutcome: "Verify approve and audit next steps are treated as gated on the home page.",
      riskLevel: "medium",
    });
    await waitForState(request, approvalWorkItemId, "implementing");
    await applyAction(request, approvalWorkItemId, "submit_for_validation", "Ready for validation.");
    await applyAction(request, approvalWorkItemId, "validation_passed", "Checks look clean.");

    await page.goto("/");
    await openCompactDashboardNav(page);

    await expect(page.getByRole("heading", { name: "Monitoring", exact: true })).toBeVisible();
    await expect(page.getByText("Mission Control")).toBeVisible();
    await expect(page.getByText("Attention queue")).toBeVisible();
    await expect(page.getByText("Live activity")).toBeVisible();
    await expect(page.getByText("Read-only evidence")).toBeVisible();
    await expect(page.getByText("Operations Brief")).toBeVisible();
    await expect(page.getByRole("heading", { name: "What to inspect next" })).toBeVisible();
    await expect(page.getByText("Operator review first")).toBeVisible();
    await expect(page.getByText("Evidence first", { exact: true })).toBeVisible();
    await expect(page.getByText("Execution controls", { exact: true })).toBeVisible();
    await expect(page.getByText("0 on home", { exact: true })).toBeVisible();
    const scanOrder = page.locator("section").filter({ hasText: "Read the board top-down" }).first();
    await expect(scanOrder.getByRole("link", { name: /Attention/ })).toContainText("1");
    await expect(scanOrder.getByText("A passive path from urgent signals to evidence")).toBeVisible();
    const attentionNavLink = page.locator("nav a[href=\"/attention\"]");
    await expect(attentionNavLink).toBeVisible();
    await expect(attentionNavLink).toContainText("1");
    await expect(page.locator("nav a[href=\"/queue\"]")).toBeVisible();
    await expect(page.locator("nav a[href=\"/audit\"]")).toBeVisible();
    await expect(page.locator("nav a[href=\"/proposed-work\"]")).toBeVisible();
    const attentionBriefLink = page.getByRole("link", { name: "Open attention review" });
    await expect(attentionBriefLink).toBeVisible();
    await expect(attentionBriefLink).toHaveAttribute("href", "/attention");

    const attentionItem = page.locator("article").filter({ hasText: "Monitoring home attention item" }).first();
    await expect(attentionItem).toBeVisible();
    await expect(attentionItem.getByText("Approval required before any retry or cleanup.")).toBeVisible();
    await expect(attentionItem.getByRole("link", { name: /Open detail/ })).toBeVisible();
    await expect(attentionItem.getByRole("button")).toHaveCount(0);

    const recentEvidencePanel = page.getByText("Read-only evidence", { exact: true }).locator("xpath=ancestor::section[1]");
    const recentEvidenceItem = recentEvidencePanel.locator("article").filter({ hasText: "Monitoring home approval next step" }).first();
    await expect(recentEvidenceItem).toBeVisible();
    await expect(recentEvidenceItem.getByRole("link", { name: "Detail" })).toHaveAttribute(
      "href",
      `/work-items/${approvalWorkItemId}`,
    );
    await expect(recentEvidenceItem.getByRole("link", { name: "Runtime export" })).toHaveAttribute(
      "href",
      `/work-items/${approvalWorkItemId}#runtime-evidence-export`,
    );
    await expect(recentEvidenceItem.getByRole("link", { name: "Review index" })).toHaveAttribute(
      "href",
      "/controls#runtime-evidence-review-report",
    );
    await expect(recentEvidenceItem.getByRole("button")).toHaveCount(0);

    const approvalItem = page
      .locator("article")
      .filter({ hasText: "Monitoring home approval next step" })
      .filter({ hasText: "Authority-gated: inspect before action" })
      .first();
    await expect(approvalItem).toBeVisible();
    await expect(approvalItem.getByText("Next: Inspect evidence first")).toBeVisible();
    await expect(approvalItem.getByText("Authority-gated: inspect before action")).toBeVisible();
    await expect(approvalItem.getByRole("button")).toHaveCount(0);

    await expect(page.getByRole("button", { name: "Expand dashboard coverage" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Review risky work" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send to validation" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve work" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /approve|retry|cleanup|launch|execute|send to validation/i })).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("Operations Brief")).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
      )
      .toBeTruthy();

    await createCandidateWork(request, {
      title: "Navigation proposed count",
      requestedOutcome: "Verify proposed work count remains attached to grouped navigation.",
      source: "operator",
      sourceArtifactPath: "docs/workflows/implementation-evidence-boundary.md",
      sourceArtifactType: "manual_note",
      riskLevel: "low",
      priority: "normal",
    });
    await page.goto("/proposed-work");
    await openCompactDashboardNav(page);
    const proposedNavLink = page.locator("nav a[href=\"/proposed-work\"]");
    await expect(proposedNavLink).toHaveAttribute("aria-current", "page");
    await expect(proposedNavLink).toContainText(/\d+/);
    await expect
      .poll(async () =>
        page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
      )
      .toBeTruthy();
  });
  test("shows operational route briefs on monitoring destination pages", async ({ page }) => {
    await page.goto("/attention");
    await expect(page.getByText("Review order", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Inspect escalation evidence before opening controls" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open audit" }).first()).toHaveAttribute("href", "/audit");

    await page.goto("/active-work");
    await expect(page.getByText("Watch order", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Follow validating and review pressure first" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open attention" })).toHaveAttribute("href", "/attention");

    await page.goto("/queue");
    await expect(page.getByText("Triage order", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Balance ready work against blocked load" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open active work" })).toHaveAttribute("href", "/active-work");
    await page.setViewportSize({ width: 390, height: 844 });
    const triageBrief = page.locator("section").filter({ hasText: "Triage order" }).first();
    await expect(triageBrief).toBeVisible();
    await expect
      .poll(async () =>
        triageBrief.evaluate((section) => section.getBoundingClientRect().width <= document.documentElement.clientWidth),
      )
      .toBeTruthy();
  });
  test("shows compact routing fleet data on controls", async ({ page, request }) => {
    await seedRunnerAssignmentHandoffState();
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
    await expect(readinessPanel.getByText("Ollama OpenAI-compatible local worker")).toBeVisible();
    await expect(readinessPanel.getByText("Registry: disabled").first()).toBeVisible();
    await expect(readinessPanel.getByText("Provider gate: disabled").first()).toBeVisible();
    await expect(readinessPanel.getByText("Prompt sources: work_item_title")).toBeVisible();
    await expect(readinessPanel.getByText("Timeout policy: connect 2s, total 120s.")).toBeVisible();
    await expect(readinessPanel.getByText("cancel_requested -> request_abort_recorded")).toBeVisible();

    const documentationPanel = page.locator("section").filter({ hasText: "Indexes and approval stop lines" }).first();
    await expect(documentationPanel.getByText("Documentation authority", { exact: true })).toBeVisible();
    await expect(documentationPanel.getByText("Indexes and approval stop lines")).toBeVisible();
    await expect(documentationPanel.getByText("Blocked authority stories")).toBeVisible();
    await expect(documentationPanel.getByText("2 pending approval")).toBeVisible();
    await expect(documentationPanel.getByText("docs/architecture/index.md", { exact: true })).toBeVisible();
    await expect(documentationPanel.getByText("blocked pending explicit approval").first()).toBeVisible();
    await expect(documentationPanel.getByText("Documentation drift command")).toBeVisible();
    await expect(documentationPanel.getByText("Documentation authority report drift command")).toBeVisible();

    const verificationPanel = page.locator("section").filter({ hasText: "Checks and stop lines" }).first();
    await expect(verificationPanel.getByText("Verification readiness", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("Checks and stop lines")).toBeVisible();
    await expect(verificationPanel.getByText("Execution plan")).toBeVisible();
    await expect(verificationPanel.getByText("static-drift-chain")).toBeVisible();
    await expect(verificationPanel.getByText("dashboard-browser-build")).toBeVisible();
    await expect(verificationPanel.getByText("full-local-gate")).toBeVisible();
    await expect(verificationPanel.getByText("Handoff checkpoints")).toBeVisible();
    await expect(verificationPanel.getByText("local-development-handoff")).toBeVisible();
    await expect(verificationPanel.getByText("dashboard-change-handoff")).toBeVisible();
    await expect(verificationPanel.getByText("setup-handoff")).toBeVisible();
    await expect(verificationPanel.getByText("authority-boundary-handoff")).toBeVisible();
    await expect(verificationPanel.getByText("docs/workflows/linux-primary-development-runbook.md", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:docs", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:governed-worker-execution-dry-run", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:documentation-authority", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:verification-readiness", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:pipeline-implementation-readiness", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:pipeline-implementation-readiness", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:live-memory-source-enforcement", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:bounded-live-memory-source", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:authority-readiness", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:branch-protection-readiness", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:adaptive-scoring", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:premium-execution", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:worker-launch", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:e2e-report", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:reports", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:execution-boundary", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:execution-evidence", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:provider-fixtures", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:process-lifecycle", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:runbooks", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:runtime-export", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:runtime-review", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:safe-backlog", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:managed-recipes", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:maintenance-action-plan", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:development-runway", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:runner-assignment-status", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:runner-handoff-audit-json-validation", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:delivery-readiness", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:github-workflow-policy", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:cleanup-automation", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:maintenance-readiness", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:token-economy", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:workspace-coordination", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:tmux-orientation-report", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:tmux-orientation-report", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:mise-workflow", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:linux-install-lane", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:bmad-work-products", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:knx-obsidian-memory", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:clean-install-boundary", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:knx-obsidian-memory", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:work-packet-contracts", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:work-packet-stage-map", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:work-packet-fixtures", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:pipeline-state-matrix", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:dashboard-pipeline-fixtures", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:dashboard-memory-proposals", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run check:clean-install-boundary", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:codex-workspace", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:codex-workspace-state", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:anti-churn-event-writer", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:anti-churn-signature-classifier", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:anti-churn-event-reader", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:anti-churn-guidance-candidate-classifier", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:anti-churn-guidance-dedupe", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:anti-churn-guidance-output", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:anti-churn-verification-routing", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:anti-churn-apply-safe-gate", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:anti-churn-hook-transaction-store", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:anti-churn-source-apply", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:anti-churn-verification-rollback", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:workspace-command-resolution", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:dashboard-e2e-runner", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:e2e:dashboard:controls", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:e2e:dashboard:detail", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:e2e:dashboard:mobile", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:e2e:dashboard:managed", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:e2e:dashboard:managed:mobile", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:e2e:dashboard:provider-raw-output", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("pnpm run test:e2e:dashboard", { exact: true })).toBeVisible();
    await expect(verificationPanel.getByText("Passing verification does not approve local provider/model calls.")).toBeVisible();
    await expect(page.locator("#verification-readiness-report")).toBeVisible();

    const authorityMatrixPanel = page.locator("section").filter({ hasText: "Execution authority matrix" }).first();
    await expect(authorityMatrixPanel.getByText("Authority readiness", { exact: true })).toBeVisible();
    await expect(authorityMatrixPanel.getByText("Execution authority matrix")).toBeVisible();
    await expect(authorityMatrixPanel.getByRole("heading", { name: "Current-state reconciliation" })).toBeVisible();
    await expect(authorityMatrixPanel.getByText("merged_to_main_recorded")).toBeVisible();
    await expect(authorityMatrixPanel.getByText("Local story completion is recorded")).toBeVisible();
    await expect(authorityMatrixPanel.getByText("80dbd488885d90c225c1d7625d1e84ef75a94752").first()).toBeVisible();
    await expect(authorityMatrixPanel.getByText("Merged-to-main state is recorded true")).toBeVisible();
    await expect(authorityMatrixPanel.getByRole("heading", { name: "Next-lane authority packet" })).toBeVisible();
    await expect(authorityMatrixPanel.getByText("decision_only_no_authority_granted")).toBeVisible();
    await expect(authorityMatrixPanel.getByText("docs/workflows/execution-authority-boundary.md#next-lane-authority-decision-contract").first()).toBeVisible();
    await expect(authorityMatrixPanel.getByText("Execution blocked", { exact: true })).toBeVisible();
    await expect(authorityMatrixPanel.getByText("Do not treat the decision packet recommendation as approval.")).toBeVisible();
    await expect(authorityMatrixPanel.getByText("local-provider-execution", { exact: true })).toBeVisible();
    await expect(authorityMatrixPanel.getByText("subscription-agent-launch", { exact: true })).toBeVisible();
    await expect(authorityMatrixPanel.getByText("adaptive-scoring", { exact: true })).toBeVisible();
    await expect(
      authorityMatrixPanel
        .locator('[data-family-id="adaptive-scoring"]')
        .getByText("docs/workflows/adaptive-scoring-decision-prep.md", { exact: true }),
    ).toBeVisible();
    await expect(authorityMatrixPanel.getByText("worker-command-source-network-credentials", { exact: true })).toBeVisible();
    await expect(authorityMatrixPanel.getByText("remote-delivery-automation", { exact: true })).toBeVisible();
    await expect(authorityMatrixPanel.getByText("github-delivery", { exact: true })).toBeVisible();
    await expect(authorityMatrixPanel.getByText("github-branch-protection", { exact: true })).toBeVisible();
    await expect(authorityMatrixPanel.getByText("readiness_only_no_authority_granted")).toBeVisible();
    await expect(authorityMatrixPanel.getByText("docs/workflows/branch-protection-readiness-packet.md", { exact: true })).toBeVisible();
    await expect(authorityMatrixPanel.getByText("cleanup-automation", { exact: true })).toBeVisible();
    await expect(authorityMatrixPanel.locator('[data-family-id="local-provider-execution"][data-status-kind="blocked"]')).toBeVisible();
    await expect(authorityMatrixPanel.locator('[data-family-id="github-delivery"][data-status-kind="blocked"]')).toBeVisible();
    await expect(authorityMatrixPanel.getByText("evidence_ready_approval_required")).toBeVisible();
    await expect(authorityMatrixPanel.getByText("Required evidence").first()).toBeVisible();
    await expect(authorityMatrixPanel.getByText("Related reports").first()).toBeVisible();
    await expect(authorityMatrixPanel.getByText("Related docs").first()).toBeVisible();
    await expect(authorityMatrixPanel.getByText("Rollback path:").first()).toBeVisible();
    await expect(authorityMatrixPanel.getByText("docs/workflows/implementation-evidence-boundary.md").first()).toBeVisible();
    await expect(authorityMatrixPanel.getByText("GET /supervisor/local-cleanup-readiness-report")).toBeVisible();
    await expect(authorityMatrixPanel.getByText("explicit-authority-approval")).toBeVisible();
    await expect(authorityMatrixPanel.getByText("Authority readiness matrix entries are not execution-authority approvals.")).toBeVisible();
    await expect(page.locator("#authority-readiness-matrix-report")).toBeVisible();

    const dashboardE2EPanel = page.locator("section").filter({ hasText: "Browser verification map" }).first();
    await expect(dashboardE2EPanel.getByText("Dashboard e2e", { exact: true })).toBeVisible();
    await expect(dashboardE2EPanel.getByRole("heading", { name: "Browser verification map" })).toBeVisible();
    await expect(dashboardE2EPanel.getByText("pnpm run test:e2e:dashboard:controls", { exact: true })).toBeVisible();
    await expect(dashboardE2EPanel.getByText("pnpm run test:e2e:dashboard:detail", { exact: true })).toBeVisible();
    await expect(dashboardE2EPanel.getByText("pnpm run test:e2e:dashboard:mobile", { exact: true })).toBeVisible();
    await expect(dashboardE2EPanel.getByText("pnpm run test:e2e:dashboard:managed", { exact: true })).toBeVisible();
    await expect(dashboardE2EPanel.getByText("pnpm run test:e2e:dashboard:managed:mobile", { exact: true })).toBeVisible();
    await expect(dashboardE2EPanel.getByText("pnpm run test:e2e:dashboard:provider-raw-output", { exact: true })).toBeVisible();
    await expect(dashboardE2EPanel.getByText("pnpm run check:e2e-report", { exact: true })).toBeVisible();
    await expect(dashboardE2EPanel.getByText("Browser verification does not approve local provider/model calls.")).toBeVisible();

    const reportCatalogPanel = page.locator("section").filter({ hasText: "Supervisor evidence map" }).first();
    await expect(reportCatalogPanel.getByText("Report catalog", { exact: true })).toBeVisible();
    await expect(reportCatalogPanel.getByText("Supervisor evidence map")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/execution-readiness-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/verification-readiness-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/authority-readiness-matrix-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/dashboard-e2e-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/maintenance-action-plan-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/development-runway-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/runtime-evidence-review-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/safe-development-backlog")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/managed-recipe-policy-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/github-workflow-policy-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/github-delivery-authority-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/git-hygiene-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/local-cleanup-readiness-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/remote-cleanup-sync-readiness-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/trusted-autonomy-readiness-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/epic-6-completion-audit-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/epic-6-mvp-proof-trial-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/codex-readiness-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/codex-implementation-approval-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/claude-review-readiness-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/claude-review-approval-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/delivery-readiness-policy-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/trusted-delivery-eligibility-report")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/disabled-provider-proofs")).toBeVisible();
    await expect(reportCatalogPanel.getByText("GET /supervisor/execution-state-boundary")).toBeVisible();
    await expect(reportCatalogPanel.getByText("Catalog entries are references, not approvals.")).toBeVisible();
    await expect(page.locator("#supervisor-report-catalog")).toBeVisible();

    const maintenancePanel = page.locator("section").filter({ hasText: "Safe work map" }).first();
    await expect(maintenancePanel.getByText("Maintenance readiness", { exact: true })).toBeVisible();
    await expect(maintenancePanel.getByText("Safe work map")).toBeVisible();
    await expect(maintenancePanel.getByText("documentation-hygiene")).toBeVisible();
    await expect(maintenancePanel.getByText("verification-hygiene")).toBeVisible();
    await expect(maintenancePanel.getByText("authority-blocker-watch")).toBeVisible();
    await expect(maintenancePanel.getByText("Related reports").first()).toBeVisible();
    await expect(maintenancePanel.getByRole("link", { name: "GET /supervisor/documentation-authority-report" }).first()).toHaveAttribute(
      "href",
      "/controls#documentation-authority-report",
    );
    await expect(maintenancePanel.getByText("Related docs").first()).toBeVisible();
    await expect(maintenancePanel.getByText("docs/workflows/implementation-evidence-boundary.md", { exact: true }).first()).toBeVisible();
    await expect(maintenancePanel.getByRole("link", { name: "/controls#dashboard-e2e-report" }).first()).toBeVisible();
    await expect(maintenancePanel.getByText("Maintenance work must not approve local provider/model calls.")).toBeVisible();

    const actionPlanPanel = page.locator("section").filter({ hasText: "Next safe work plan" }).first();
    await expect(actionPlanPanel.getByText("Maintenance action plan", { exact: true })).toBeVisible();
    await expect(actionPlanPanel.getByText("Next safe work plan")).toBeVisible();
    await expect(actionPlanPanel.getByText("select-large-safe-slice")).toBeVisible();
    await expect(actionPlanPanel.getByText("verify-evidence-surfaces")).toBeVisible();
    await expect(actionPlanPanel.getByText("preserve-authority-stop-lines")).toBeVisible();
    await expect(actionPlanPanel.getByText("Related reports").first()).toBeVisible();
    await expect(actionPlanPanel.getByRole("link", { name: "GET /supervisor/safe-development-backlog" })).toHaveAttribute(
      "href",
      "/controls#safe-development-backlog",
    );
    await expect(actionPlanPanel.getByText("Related docs").first()).toBeVisible();
    await expect(actionPlanPanel.getByText("docs/workflows/implementation-evidence-boundary.md", { exact: true }).first()).toBeVisible();
    await expect(
      actionPlanPanel
        .locator("article")
        .filter({ hasText: "preserve-authority-stop-lines" })
        .getByText("pnpm run check:process-lifecycle", { exact: true }),
    ).toBeVisible();
    await expect(actionPlanPanel.getByRole("link", { name: "/controls#safe-development-backlog" })).toBeVisible();
    await expect(actionPlanPanel.getByText("Maintenance action plans are not execution-authority approvals.")).toBeVisible();
    await expect(page.locator("#maintenance-action-plan-report")).toBeVisible();

    const runwayPanel = page.locator("section").filter({ hasText: "Larger PR slice planner" }).first();
    await expect(runwayPanel.getByText("Development runway", { exact: true })).toBeVisible();
    await expect(runwayPanel.getByText("Larger PR slice planner")).toBeVisible();
    await expect(runwayPanel.getByText("report-evidence-navigation-slice")).toBeVisible();
    await expect(runwayPanel.getByText("Next lane handoff").first()).toBeVisible();
    await expect(runwayPanel.getByText("branch: codex/dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-keyboard-loop-refresh")).toBeVisible();
    await expect(runwayPanel.getByText('start: node ./scripts/codex-workspace.mjs start "dispatcher closed source guard filter empty state shortcut reason keyboard loop refresh"')).toBeVisible();
    await expect(runwayPanel.getByText("pnpm run check:runner-assignment-status").first()).toBeVisible();
    await expect(runwayPanel.getByText("pnpm run check:safe-backlog").first()).toBeVisible();
    await expect(runwayPanel.getByText("Do not treat this lane-start recommendation as merge, cleanup, issue-sync, or execution-authority approval.")).toBeVisible();
    await expect(runwayPanel.getByText("Do not start or modify another active lane while using this recommendation.").first()).toBeVisible();
    await expect(runwayPanel.getByText("verification-runbook-hardening-slice")).toBeVisible();
    await expect(runwayPanel.getByText("authority-blocker-maintenance-slice")).toBeVisible();
    await expect(runwayPanel.getByText("Readiness checks").first()).toBeVisible();
    await expect(runwayPanel.getByText("ready-backlog-item", { exact: true })).toBeVisible();
    await expect(runwayPanel.getByText("Batching policy")).toBeVisible();
    await expect(runwayPanel.getByText("PR batching checklist")).toBeVisible();
    await expect(runwayPanel.getByText("larger reviewable PRs")).toBeVisible();
    await expect(runwayPanel.getByText("Do not open separate PRs for isolated report text")).toBeVisible();
    await expect(runwayPanel.getByText("PR body names the safe slice")).toBeVisible();
    await expect(runwayPanel.getByText("Related reports").first()).toBeVisible();
    await expect(runwayPanel.getByRole("link", { name: "GET /supervisor/report-catalog" })).toHaveAttribute(
      "href",
      "/controls#supervisor-report-catalog",
    );
    await expect(runwayPanel.getByText("Related docs").first()).toBeVisible();
    await expect(runwayPanel.getByText("docs/workflows/implementation-evidence-boundary.md", { exact: true }).first()).toBeVisible();
    await expect(runwayPanel.getByRole("link", { name: "/controls#safe-development-backlog" }).first()).toBeVisible();
    await expect(runwayPanel.getByText("ready-backlog-item", { exact: true })).toBeVisible();
    await expect(runwayPanel.getByText("handoff-checkpoint-coverage", { exact: true })).toBeVisible();
    await expect(runwayPanel.getByText("authority-families-blocked", { exact: true })).toBeVisible();
    await expect(runwayPanel.getByText("pnpm run check:development-runway", { exact: true }).first()).toBeVisible();
    await expect(runwayPanel.getByRole("link", { name: "/controls#development-runway-report" }).first()).toBeVisible();
    await expect(runwayPanel.getByText("Development runway slices are not execution-authority approvals.")).toBeVisible();
    await expect(page.locator("#development-runway-report")).toBeVisible();

    const runtimeReviewPanel = page.locator("section").filter({ hasText: "Work-item evidence queue" }).first();
    await expect(runtimeReviewPanel.getByText("Runtime evidence review", { exact: true })).toBeVisible();
    await expect(runtimeReviewPanel.getByText("Work-item evidence queue")).toBeVisible();
    await expect(runtimeReviewPanel.getByRole("link", { name: "GET /supervisor/runtime-evidence-review-report" }).first()).toBeVisible();
    await expect(runtimeReviewPanel.getByText("Related reports").first()).toBeVisible();
    await expect(runtimeReviewPanel.getByText("Related docs").first()).toBeVisible();
    await expect(runtimeReviewPanel.getByText("docs/workflows/implementation-evidence-boundary.md", { exact: true }).first()).toBeVisible();
    await expect(runtimeReviewPanel.getByRole("heading", { name: "Cross-check path" })).toBeVisible();
    await expect(runtimeReviewPanel.getByRole("link", { name: /Development runway/ })).toHaveAttribute(
      "href",
      "/controls#development-runway-report",
    );
    await expect(runtimeReviewPanel.getByRole("link", { name: "GET /supervisor/runtime-evidence-review-report" }).first()).toHaveAttribute(
      "href",
      "/controls#runtime-evidence-review-report",
    );
    await expect(runtimeReviewPanel.getByRole("link", { name: "/controls#runtime-evidence-review-report" }).first()).toBeVisible();
    await expect(runtimeReviewPanel.getByText("Runtime evidence review is not execution-authority approval.")).toBeVisible();
    await expect(page.locator("#runtime-evidence-review-report")).toBeVisible();

    const safeBacklogPanel = page.locator("section").filter({ hasText: "Large-slice development map" }).first();
    await expect(safeBacklogPanel.getByText("Safe backlog", { exact: true })).toBeVisible();
    await expect(safeBacklogPanel.getByText("Large-slice development map")).toBeVisible();
    await expect(safeBacklogPanel.getByText("Report-aligned backlog governance")).toBeVisible();
    const reportAlignmentCard = safeBacklogPanel.locator("article").filter({ hasText: "Report-aligned backlog governance" });
    await expect(reportAlignmentCard.getByText("closed", { exact: true })).toBeVisible();
    await expect(reportAlignmentCard.getByText("slice: complete", { exact: true })).toBeVisible();
    await expect(reportAlignmentCard.getByText("Use this completed item as evidence only; do not requeue it as a new lane.")).toBeVisible();
    await expect(safeBacklogPanel.getByRole("heading", { name: "Verification surface hardening" })).toBeVisible();
    const verificationBacklogCards = safeBacklogPanel.locator("article").filter({ has: page.getByRole("heading", { name: "Verification surface hardening" }) });
    await expect(
      verificationBacklogCards.getByText("Use this completed verification lane as evidence only; do not requeue codex/verification-surface-hardening as a new lane."),
    ).toBeVisible();
    await expect(safeBacklogPanel.getByText("Related report links").first()).toBeVisible();
    await expect(safeBacklogPanel.getByRole("link", { name: "GET /supervisor/maintenance-readiness-report" }).first()).toHaveAttribute(
      "href",
      "/controls#maintenance-readiness-report",
    );
    await expect(verificationBacklogCards).toHaveCount(1);
    const verificationBacklogCard = verificationBacklogCards.first();
    await expect(verificationBacklogCard.getByText("closed", { exact: true })).toBeVisible();
    await expect(verificationBacklogCard.getByText("slice: complete", { exact: true })).toBeVisible();
    await expect(verificationBacklogCard.getByText("Source evidence labels", { exact: true })).toBeVisible();
    await expect(verificationBacklogCard.getByText("3-27-safe-development-backlog-report.md")).toBeVisible();
    await expect(verificationBacklogCard.getByText("3-32-safe-development-backlog-drift-check.md")).toBeVisible();
    await expect(verificationBacklogCard.getByText("3-47-core-readiness-drift-checks.md")).toBeVisible();
    await expect(verificationBacklogCard.getByText("3-56-verification-execution-plan-groups.md")).toBeVisible();
    await expect(verificationBacklogCard.getByText("3-58-verification-handoff-checkpoints.md")).toBeVisible();
    await expect(verificationBacklogCard.getByText("3-60-safe-backlog-report-anchors.md")).toBeVisible();
    await expect(verificationBacklogCard.getByText("Related docs", { exact: true })).toBeVisible();
    await expect(verificationBacklogCard.getByText("docs/workflows/implementation-evidence-boundary.md", { exact: true })).toHaveCount(1);
    await expect(verificationBacklogCard.getByText("docs/workflows/implementation-evidence-boundary.md", { exact: true })).toBeVisible();
    await expect(verificationBacklogCard.getByRole("link", { name: "GET /supervisor/verification-readiness-report" })).toHaveAttribute(
      "href",
      "/controls#verification-readiness-report",
    );
    await expect(verificationBacklogCard.getByRole("link", { name: "GET /supervisor/dashboard-e2e-report" })).toHaveAttribute(
      "href",
      "/controls#dashboard-e2e-report",
    );
    await expect(verificationBacklogCard.getByRole("link", { name: "/controls#verification-readiness-report" })).toBeVisible();
    await expect(verificationBacklogCard.getByRole("link", { name: "/controls#dashboard-e2e-report" })).toBeVisible();
    await expect(verificationBacklogCard.getByRole("link", { name: "/controls#supervisor-report-catalog" })).toBeVisible();
    await expect(verificationBacklogCard.getByRole("link", { name: "/controls#development-runway-report" })).toBeVisible();
    await expect(
      verificationBacklogCard.getByText("Use this completed verification lane as evidence only; do not requeue codex/verification-surface-hardening as a new lane."),
    ).toBeVisible();
    await expect(
      verificationBacklogCard.getByText("Verification surface hardening is read-only planning guidance, not execution-authority approval."),
    ).toBeVisible();
    await expect(safeBacklogPanel.getByRole("heading", { name: "GitHub delivery hygiene" })).toBeVisible();
    const githubDeliveryBacklogCard = safeBacklogPanel.locator("article").filter({ has: page.getByRole("heading", { name: "GitHub delivery hygiene" }) });
    await expect(githubDeliveryBacklogCard.getByRole("link", { name: "/controls#github-workflow-policy-report" })).toBeVisible();
    await expect(
      githubDeliveryBacklogCard.getByText("Use this completed GitHub delivery hygiene lane as evidence only; do not requeue codex/github-delivery-hygiene as a new lane."),
    ).toBeVisible();
    await expect(githubDeliveryBacklogCard.getByText("docs/github-connector-workflow.md", { exact: true })).toHaveCount(1);
    await expect(githubDeliveryBacklogCard.getByText("docs/workflows/implementation-evidence-boundary.md", { exact: true })).toHaveCount(1);
    await expect(safeBacklogPanel.getByText("persistent plaintext gh token storage")).toBeVisible();
    await expect(safeBacklogPanel.getByRole("heading", { name: "Worker backlog queue refresh" })).toBeVisible();
    const workerQueueCard = safeBacklogPanel.locator("article").filter({ has: page.getByRole("heading", { name: "Worker backlog queue refresh" }) });
    await expect(workerQueueCard.getByText("closed", { exact: true })).toBeVisible();
    await expect(workerQueueCard.getByText("slice: complete")).toBeVisible();
    await expect(workerQueueCard.getByText("claim-next evidence can become starved")).toBeVisible();
    await expect(workerQueueCard.getByText("do not requeue worker-backlog-queue-refresh")).toBeVisible();
    await expect(workerQueueCard.getByText("claim-next should advance to report-catalog-shortcut-refresh")).toBeVisible();
    await expect(workerQueueCard.getByText("3-32-safe-development-backlog-drift-check.md")).toBeVisible();
    await expect(workerQueueCard.getByRole("link", { name: "GET /supervisor/runner-assignment-status-report" })).toHaveAttribute(
      "href",
      "/controls#runner-assignment-status",
    );
    await expect(workerQueueCard.getByRole("link", { name: "/controls#runner-assignment-status" })).toBeVisible();
    await expect(safeBacklogPanel.getByRole("heading", { name: "Lane handoff evidence refresh" })).toBeVisible();
    const handoffCard = safeBacklogPanel.locator("article").filter({ has: page.getByRole("heading", { name: "Lane handoff evidence refresh" }) });
    await expect(handoffCard.getByText("closed", { exact: true })).toBeVisible();
    await expect(handoffCard.getByText("slice: complete")).toBeVisible();
    await expect(handoffCard.getByText("visible resume packet")).toBeVisible();
    await expect(handoffCard.getByText("do not requeue lane-handoff-evidence-refresh")).toBeVisible();
    await expect(handoffCard.getByRole("link", { name: "GET /supervisor/runner-assignment-status-report" })).toHaveAttribute(
      "href",
      "/controls#runner-assignment-status",
    );
    await expect(safeBacklogPanel.getByRole("heading", { name: "Report catalog shortcut refresh" })).toBeVisible();
    const shortcutCard = safeBacklogPanel.locator("article").filter({ has: page.getByRole("heading", { name: "Report catalog shortcut refresh" }) });
    await expect(shortcutCard.getByText("closed", { exact: true })).toBeVisible();
    await expect(shortcutCard.getByText("slice: complete")).toBeVisible();
    await expect(shortcutCard.getByText("explicit dashboard report anchors")).toBeVisible();
    await expect(shortcutCard.getByText("do not requeue report-catalog-shortcut-refresh")).toBeVisible();
    await expect(shortcutCard.getByRole("link", { name: "GET /supervisor/runner-assignment-status-report" })).toHaveAttribute(
      "href",
      "/controls#runner-assignment-status",
    );
    await expect(safeBacklogPanel.getByRole("heading", { name: "Dispatcher continuity snapshot refresh" })).toBeVisible();
    const dispatcherCard = safeBacklogPanel.locator("article").filter({ has: page.getByRole("heading", { name: "Dispatcher continuity snapshot refresh" }) });
    await expect(dispatcherCard.getByText("closed", { exact: true })).toBeVisible();
    await expect(dispatcherCard.getByText("slice: complete")).toBeVisible();
    await expect(dispatcherCard.getByText("Runner assignment status now exposes a dispatcher continuity snapshot")).toBeVisible();
    await expect(dispatcherCard.getByText("do not requeue dispatcher-continuity-snapshot-refresh")).toBeVisible();
    await expect(safeBacklogPanel.getByRole("heading", { name: "Assignment report queue proof refresh" })).toBeVisible();
    const queueProofCard = safeBacklogPanel.locator("article").filter({ has: page.getByRole("heading", { name: "Assignment report queue proof refresh" }) });
    await expect(queueProofCard.getByText("slice: complete")).toBeVisible();
    await expect(queueProofCard.getByText("do not requeue assignment-report-queue-proof-refresh")).toBeVisible();
    const fixtureCard = safeBacklogPanel.locator("article").filter({ hasText: "Dispatcher queue state fixtures refresh" });
    await expect(fixtureCard.getByText("slice: complete")).toBeVisible();
    await expect(fixtureCard.getByText("do not requeue dispatcher-queue-state-fixtures-refresh")).toBeVisible();
    const handoffBadgesCard = safeBacklogPanel.locator("article").filter({ hasText: "Dispatcher queue handoff badges refresh" });
    await expect(handoffBadgesCard.getByText("slice: complete")).toBeVisible();
    await expect(handoffBadgesCard.getByText("do not requeue dispatcher-queue-handoff-badges-refresh")).toBeVisible();
    const handoffStatusCard = safeBacklogPanel.locator("article").filter({ hasText: "Dispatcher queue handoff status refresh" });
    await expect(handoffStatusCard.getByText("slice: complete")).toBeVisible();
    await expect(handoffStatusCard.getByText("do not requeue dispatcher-queue-handoff-status-refresh")).toBeVisible();
    const handoffLifecycleCard = safeBacklogPanel.locator("article").filter({ hasText: "Dispatcher queue handoff lifecycle refresh" });
    await expect(handoffLifecycleCard.getByText("slice: complete")).toBeVisible();
    await expect(handoffLifecycleCard.getByText("do not requeue dispatcher-queue-handoff-lifecycle-refresh")).toBeVisible();
    const handoffRecoveryCard = safeBacklogPanel.locator("article").filter({ hasText: "Dispatcher queue handoff recovery refresh" });
    await expect(handoffRecoveryCard.getByText("slice: complete")).toBeVisible();
    await expect(handoffRecoveryCard.getByText("do not requeue dispatcher-queue-handoff-recovery-refresh")).toBeVisible();
    const handoffAuditCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher queue handoff audit refresh", exact: true }) });
    await expect(handoffAuditCard.getByText("slice: complete")).toBeVisible();
    await expect(handoffAuditCard.getByText("do not requeue dispatcher-queue-handoff-audit-refresh")).toBeVisible();
    const handoffRetentionCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher queue handoff audit retention refresh", exact: true }) });
    await expect(handoffRetentionCard.getByText("slice: complete")).toBeVisible();
    await expect(handoffRetentionCard.getByText("do not requeue dispatcher-queue-handoff-audit-retention-refresh")).toBeVisible();
    const handoffQueryCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher queue handoff audit query refresh", exact: true }) });
    await expect(handoffQueryCard.getByText("slice: complete")).toBeVisible();
    await expect(handoffQueryCard.getByText("do not requeue dispatcher-queue-handoff-audit-query-refresh")).toBeVisible();
    const handoffExportCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher queue handoff audit export refresh", exact: true }) });
    await expect(handoffExportCard.getByText("slice: complete")).toBeVisible();
    await expect(handoffExportCard.getByText("do not requeue dispatcher-queue-handoff-audit-export-refresh")).toBeVisible();
    const handoffDownloadCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher queue handoff audit download refresh", exact: true }) });
    await expect(handoffDownloadCard.getByText("slice: complete")).toBeVisible();
    await expect(handoffDownloadCard.getByText("do not requeue dispatcher-queue-handoff-audit-download-refresh")).toBeVisible();
    const handoffJsonCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher queue handoff audit JSON refresh", exact: true }) });
    await expect(handoffJsonCard.getByText("slice: complete")).toBeVisible();
    await expect(handoffJsonCard.getByText("do not requeue dispatcher-queue-handoff-audit-json-refresh")).toBeVisible();
    const handoffJsonSchemaCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher queue handoff audit JSON schema refresh", exact: true }) });
    await expect(handoffJsonSchemaCard.getByText("slice: complete")).toBeVisible();
    await expect(handoffJsonSchemaCard.getByText("do not requeue dispatcher-queue-handoff-audit-json-schema-refresh")).toBeVisible();
    const handoffJsonValidationCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher queue handoff audit JSON validation refresh", exact: true }) });
    await expect(handoffJsonValidationCard.getByText("slice: complete")).toBeVisible();
    await expect(handoffJsonValidationCard.getByText("do not requeue dispatcher-queue-handoff-audit-json-validation-refresh")).toBeVisible();
    const handoffJsonValidationFixturesCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher queue handoff audit JSON validation fixtures refresh", exact: true }) });
    await expect(handoffJsonValidationFixturesCard.getByText("slice: complete")).toBeVisible();
    await expect(handoffJsonValidationFixturesCard.getByText("do not requeue dispatcher-queue-handoff-audit-json-validation-fixtures-refresh")).toBeVisible();
    const cleanupAssignmentClosureCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher cleanup assignment closure refresh", exact: true }) });
    await expect(cleanupAssignmentClosureCard.getByText("slice: complete")).toBeVisible();
    await expect(cleanupAssignmentClosureCard.getByText("do not requeue dispatcher-cleanup-assignment-closure-refresh")).toBeVisible();
    const cleanupAssignmentReportCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher cleanup assignment report refresh", exact: true }) });
    await expect(cleanupAssignmentReportCard.getByText("slice: complete")).toBeVisible();
    await expect(cleanupAssignmentReportCard.getByText("do not requeue dispatcher-cleanup-assignment-report-refresh")).toBeVisible();
    const assignmentPanelFilterCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher assignment panel filter refresh", exact: true }) });
    await expect(assignmentPanelFilterCard.getByText("slice: complete")).toBeVisible();
    await expect(assignmentPanelFilterCard.getByText("do not requeue dispatcher-assignment-panel-filter-refresh")).toBeVisible();
    const closedLaneRequeueGuardCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher closed lane requeue guard refresh", exact: true }) });
    await expect(closedLaneRequeueGuardCard.getByText("slice: complete")).toBeVisible();
    await expect(closedLaneRequeueGuardCard.getByText("do not requeue dispatcher-closed-lane-requeue-guard-refresh")).toBeVisible();
    const closedSourceGuardReportCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher closed source guard report refresh", exact: true }) });
    await expect(closedSourceGuardReportCard.getByText("slice: complete")).toBeVisible();
    await expect(closedSourceGuardReportCard.getByText("do not requeue dispatcher-closed-source-guard-report-refresh")).toBeVisible();
    const closedSourceGuardDrilldownCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher closed source guard drilldown refresh", exact: true }) });
    await expect(closedSourceGuardDrilldownCard.getByText("slice: complete")).toBeVisible();
    await expect(closedSourceGuardDrilldownCard.getByText("do not requeue dispatcher-closed-source-guard-drilldown-refresh")).toBeVisible();
    const closedSourceGuardRollupCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher closed source guard rollup refresh", exact: true }) });
    await expect(closedSourceGuardRollupCard.getByText("slice: complete")).toBeVisible();
    await expect(closedSourceGuardRollupCard.getByText("do not requeue dispatcher-closed-source-guard-rollup-refresh")).toBeVisible();
    const closedSourceGuardRollupFilterCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher closed source guard rollup filter refresh", exact: true }) });
    await expect(closedSourceGuardRollupFilterCard.getByText("slice: complete")).toBeVisible();
    await expect(closedSourceGuardRollupFilterCard.getByText("do not requeue dispatcher-closed-source-guard-rollup-filter-refresh")).toBeVisible();
    const closedSourceGuardSourceKindSummaryCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher closed source guard source kind summary refresh", exact: true }) });
    await expect(closedSourceGuardSourceKindSummaryCard.getByText("slice: complete")).toBeVisible();
    await expect(closedSourceGuardSourceKindSummaryCard.getByText("do not requeue dispatcher-closed-source-guard-source-kind-summary-refresh")).toBeVisible();
    const closedSourceGuardFilterResetCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher closed source guard filter reset refresh", exact: true }) });
    await expect(closedSourceGuardFilterResetCard.getByText("Slice: complete")).toBeVisible();
    await expect(closedSourceGuardFilterResetCard.getByText("do not requeue dispatcher-closed-source-guard-filter-reset-refresh")).toBeVisible();
    const closedSourceGuardFilterPresetsCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher closed source guard filter presets refresh", exact: true }) });
    await expect(closedSourceGuardFilterPresetsCard.getByText("Slice: complete")).toBeVisible();
    await expect(closedSourceGuardFilterPresetsCard.getByText("do not requeue dispatcher-closed-source-guard-filter-presets-refresh")).toBeVisible();
    const closedSourceGuardFilterCountsCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher closed source guard filter counts refresh", exact: true }) });
    await expect(closedSourceGuardFilterCountsCard.getByText("Slice: complete")).toBeVisible();
    await expect(closedSourceGuardFilterCountsCard.getByText("do not requeue dispatcher-closed-source-guard-filter-counts-refresh")).toBeVisible();
    const closedSourceGuardFilterEmptyStateCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher closed source guard filter empty state refresh", exact: true }) });
    await expect(closedSourceGuardFilterEmptyStateCard.getByText("Slice: complete")).toBeVisible();
    await expect(closedSourceGuardFilterEmptyStateCard.getByText("do not requeue dispatcher-closed-source-guard-filter-empty-state-refresh")).toBeVisible();
    const closedSourceGuardFilterEmptyStateResetCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher closed source guard filter empty state reset refresh", exact: true }) });
    await expect(closedSourceGuardFilterEmptyStateResetCard.getByText("Slice: complete")).toBeVisible();
    await expect(closedSourceGuardFilterEmptyStateResetCard.getByText("do not requeue dispatcher-closed-source-guard-filter-empty-state-reset-refresh")).toBeVisible();
    const closedSourceGuardFilterEmptyStateShortcutsCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher closed source guard filter empty state shortcuts refresh", exact: true }) });
    await expect(closedSourceGuardFilterEmptyStateShortcutsCard.getByText("Slice: complete")).toBeVisible();
    await expect(closedSourceGuardFilterEmptyStateShortcutsCard.getByText("do not requeue dispatcher-closed-source-guard-filter-empty-state-shortcuts-refresh")).toBeVisible();
    const closedSourceGuardFilterEmptyStateShortcutCountsCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher closed source guard filter empty state shortcut counts refresh", exact: true }) });
    await expect(closedSourceGuardFilterEmptyStateShortcutCountsCard.getByText("Slice: complete")).toBeVisible();
    await expect(closedSourceGuardFilterEmptyStateShortcutCountsCard.getByText("do not requeue dispatcher-closed-source-guard-filter-empty-state-shortcut-counts-refresh")).toBeVisible();
    const closedSourceGuardFilterEmptyStateShortcutDisabledReasonsCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher closed source guard filter empty state shortcut disabled reasons refresh", exact: true }) });
    await expect(closedSourceGuardFilterEmptyStateShortcutDisabledReasonsCard.getByText("Slice: complete")).toBeVisible();
    await expect(closedSourceGuardFilterEmptyStateShortcutDisabledReasonsCard.getByText("do not requeue dispatcher-closed-source-guard-filter-empty-state-shortcut-disabled-reasons-refresh")).toBeVisible();
    const closedSourceGuardFilterEmptyStateShortcutReasonFocusCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher closed source guard filter empty state shortcut reason focus refresh", exact: true }) });
    await expect(closedSourceGuardFilterEmptyStateShortcutReasonFocusCard.getByText("Slice: complete")).toBeVisible();
    await expect(closedSourceGuardFilterEmptyStateShortcutReasonFocusCard.getByText("do not requeue dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-focus-refresh")).toBeVisible();
    const closedSourceGuardFilterEmptyStateShortcutReasonKeyboardLoopCard = safeBacklogPanel
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Dispatcher closed source guard filter empty state shortcut reason keyboard loop refresh", exact: true }) });
    await expect(closedSourceGuardFilterEmptyStateShortcutReasonKeyboardLoopCard.getByText("branch: codex/dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-keyboard-loop-refresh")).toBeVisible();
    await expect(closedSourceGuardFilterEmptyStateShortcutReasonKeyboardLoopCard.getByText('start: node ./scripts/codex-workspace.mjs start "dispatcher closed source guard filter empty state shortcut reason keyboard loop refresh"')).toBeVisible();
    await expect(closedSourceGuardFilterEmptyStateShortcutReasonKeyboardLoopCard.getByText("pnpm run test:e2e:dashboard:controls")).toBeVisible();
    await expect(safeBacklogPanel.getByText("Execution-authority stories")).toBeVisible();
    await expect(safeBacklogPanel.getByText("Safe backlog items are planning and maintenance guidance, not execution-authority approvals.")).toBeVisible();

    const runnerAssignmentPanel = page.locator("#runner-assignment-status");
    await expect(runnerAssignmentPanel.getByText("Runner Assignment Status")).toBeVisible();
    const closedAssignmentEvidence = runnerAssignmentPanel.getByTestId("closed-assignment-evidence");
    await expect(closedAssignmentEvidence.getByText("Closed assignment evidence", { exact: true })).toBeVisible();
    await expect(closedAssignmentEvidence.getByText("dispatcher-cleanup-assignment-closure-refresh: lane-closed branch codex/dispatcher-cleanup-assignment-closure-refresh - No assignment action")).toBeVisible();
    await expect(runnerAssignmentPanel.getByText("dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-keyboard-loop-refresh: assignable (backlog-assignable) branch codex/dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-keyboard-loop-refresh")).toBeVisible();
    const sourceCompletionRollup = runnerAssignmentPanel.getByTestId("source-completion-rollup");
    await expect(sourceCompletionRollup.getByText("Source completion rollup", { exact: true })).toBeVisible();
    await expect(sourceCompletionRollup.getByText("Total: 1", { exact: true })).toBeVisible();
    await expect(sourceCompletionRollup.getByText("Assignment: 0", { exact: true })).toBeVisible();
    await expect(sourceCompletionRollup.getByText("Workspace: 1", { exact: true })).toBeVisible();
    await expect(sourceCompletionRollup.getByText("Source backlog items: read-only-evidence-polish", { exact: true })).toBeVisible();
    const assignmentRowFilters = runnerAssignmentPanel.getByTestId("assignment-row-filters");
    await expect(assignmentRowFilters.getByText("Assignment row filters", { exact: true })).toBeVisible();
    await expect(assignmentRowFilters.getByLabel("Source completion")).toBeVisible();
    await expect(assignmentRowFilters.getByText(/Showing \d+\/\d+ rows for Needs attention from All sources with all source-completion states\./)).toBeVisible();
    const filteredSourceSummary = assignmentRowFilters.getByTestId("filtered-source-kind-summary");
    await expect(filteredSourceSummary.getByText("Filtered source summary", { exact: true })).toBeVisible();
    await expect(filteredSourceSummary.getByText(/Rows: workspace \d+, lane assignment \d+, backlog \d+/)).toBeVisible();
    await expect(filteredSourceSummary.getByText(/Source completion: assignment \d+, workspace \d+, none \d+/)).toBeVisible();
    const resetAssignmentFilters = assignmentRowFilters.getByRole("button", { name: "Reset assignment row filters" });
    await expect(resetAssignmentFilters).toBeDisabled();
    await expect(runnerAssignmentPanel.getByText("Candidate: dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-keyboard-loop-refresh")).toBeVisible();
    await assignmentRowFilters.getByLabel("Classification").selectOption("active");
    await assignmentRowFilters.getByLabel("Source", { exact: true }).selectOption("workspace");
    await expect(resetAssignmentFilters).toBeEnabled();
    await expect(assignmentRowFilters.getByText(/Showing [1-9]\d*\/\d+ rows for active from Workspace with all source-completion states\./)).toBeVisible();
    await expect(filteredSourceSummary.getByText(/Rows: workspace [1-9]\d*, lane assignment 0, backlog 0/)).toBeVisible();
    await expect(filteredSourceSummary.getByText(/Source completion: assignment 0, workspace 0, none \d+/)).toBeVisible();
    await expect(
      runnerAssignmentPanel
        .locator("article")
        .filter({ hasText: "e2e-dispatcher-queue-handoff-badges-refresh" })
        .getByText("source: Workspace"),
    ).toBeVisible();
    await assignmentRowFilters.getByLabel("Classification").selectOption("assignable");
    await assignmentRowFilters.getByLabel("Source", { exact: true }).selectOption("backlog");
    await expect(assignmentRowFilters.getByText(/Showing \d+\/\d+ rows for assignable from Backlog with all source-completion states\./)).toBeVisible();
    await expect(runnerAssignmentPanel.locator("article").filter({ hasText: "Dispatcher closed source guard filter empty state shortcut reason keyboard loop refresh" }).getByText("source: Backlog")).toBeVisible();
    await assignmentRowFilters.getByLabel("Classification").selectOption("blocked");
    await expect(assignmentRowFilters.getByText(/Showing 1\/\d+ rows for blocked from Backlog with all source-completion states\./)).toBeVisible();
    await expect(runnerAssignmentPanel.locator("article").filter({ hasText: "Execution-authority stories" }).getByText("source: Backlog")).toBeVisible();
    await assignmentRowFilters.getByLabel("Classification").selectOption("closed");
    await expect(assignmentRowFilters.getByText(/Showing \d+\/\d+ rows for closed from Backlog with all source-completion states\./)).toBeVisible();
    const closedAssignmentPanelFilterRow = runnerAssignmentPanel.locator("article").filter({ hasText: "Dispatcher assignment panel filter refresh" });
    await expect(closedAssignmentPanelFilterRow.getByText("backlog-closed")).toBeVisible();
    await expect(closedAssignmentPanelFilterRow.getByText("source: Backlog")).toBeVisible();
    await expect(closedAssignmentPanelFilterRow.getByText("branch: none")).toBeVisible();
    const closedLaneRequeueGuardRow = runnerAssignmentPanel.locator("article").filter({ hasText: "Dispatcher closed lane requeue guard refresh" });
    await expect(closedLaneRequeueGuardRow.getByText("backlog-closed")).toBeVisible();
    await expect(closedLaneRequeueGuardRow.getByText("source: Backlog")).toBeVisible();
    await expect(closedLaneRequeueGuardRow.getByText("branch: none")).toBeVisible();
    await assignmentRowFilters.getByLabel("Source completion").selectOption("workspace");
    await expect(assignmentRowFilters.getByText(/Showing 1\/\d+ rows for closed from Backlog with workspace source completion\./)).toBeVisible();
    await expect(filteredSourceSummary.getByText("Rows: workspace 0, lane assignment 0, backlog 1", { exact: true })).toBeVisible();
    await expect(filteredSourceSummary.getByText("Source completion: assignment 0, workspace 1, none 0", { exact: true })).toBeVisible();
    const sourceCompletionRow = runnerAssignmentPanel.locator("article").filter({ hasText: "Read-only evidence polish" });
    const sourceCompletionEvidence = sourceCompletionRow.getByTestId("source-completion-evidence");
    await expect(sourceCompletionEvidence.getByText("Source completion evidence", { exact: true })).toBeVisible();
    await expect(sourceCompletionEvidence.getByText("Kind: workspace", { exact: true })).toBeVisible();
    await expect(sourceCompletionEvidence.getByText("Record: 20260623-read-only-evidence-polish", { exact: true })).toBeVisible();
    await expect(sourceCompletionEvidence.getByText("Source backlog item: read-only-evidence-polish", { exact: true })).toBeVisible();
    await expect(sourceCompletionEvidence.getByText("Branch: codex/read-only-evidence-polish", { exact: true })).toBeVisible();
    await expect(sourceCompletionEvidence.getByText("Task: 20260623-read-only-evidence-polish", { exact: true })).toBeVisible();
    await expect(sourceCompletionEvidence.getByText("Evidence path:")).toBeVisible();
    await expect(sourceCompletionEvidence.getByText("Summary: Closed workspace record 20260623-read-only-evidence-polish matches source backlog item read-only-evidence-polish.")).toBeVisible();
    await resetAssignmentFilters.click();
    await expect(resetAssignmentFilters).toBeDisabled();
    await expect(assignmentRowFilters.getByLabel("Classification")).toHaveValue("attention");
    await expect(assignmentRowFilters.getByLabel("Source", { exact: true })).toHaveValue("all");
    await expect(assignmentRowFilters.getByLabel("Source completion")).toHaveValue("all");
    await expect(assignmentRowFilters.getByText(/Showing \d+\/\d+ rows for Needs attention from All sources with all source-completion states\./)).toBeVisible();
    await expect(filteredSourceSummary.getByText(/Rows: workspace \d+, lane assignment \d+, backlog \d+/)).toBeVisible();
    await expect(filteredSourceSummary.getByText(/Source completion: assignment \d+, workspace \d+, none \d+/)).toBeVisible();
    const assignmentBackedPreset = assignmentRowFilters.getByRole("button", { name: "Show assignment-backed rows" });
    const workspaceBackedPreset = assignmentRowFilters.getByRole("button", { name: "Show workspace-backed rows" });
    const uncompletedPreset = assignmentRowFilters.getByRole("button", { name: "Show uncompleted rows" });
    await expect(assignmentBackedPreset).toHaveText(/Assignment-backed\s+0/);
    await expect(workspaceBackedPreset).toHaveText(/Workspace-backed\s+1/);
    await expect(uncompletedPreset).toHaveText(/Uncompleted\s+45/);
    await assignmentBackedPreset.click();
    await expect(resetAssignmentFilters).toBeEnabled();
    await expect(assignmentRowFilters.getByLabel("Classification")).toHaveValue("all");
    await expect(assignmentRowFilters.getByLabel("Source", { exact: true })).toHaveValue("all");
    await expect(assignmentRowFilters.getByLabel("Source completion")).toHaveValue("assignment");
    await expect(assignmentRowFilters.getByText(/Showing 0\/\d+ rows for All classifications from All sources with assignment source completion\./)).toBeVisible();
    await expect(
      runnerAssignmentPanel.getByText(
        "No assignment rows match the current filters. This assignment-backed view has 0 rows. Switch to Workspace-backed or Uncompleted, or reset filters before deciding the queue is empty.",
      ),
    ).toBeVisible();
    const emptyStateResetFilters = runnerAssignmentPanel.getByRole("button", { name: "Reset assignment row filters from empty state" });
    const emptyStateAssignmentShortcut = runnerAssignmentPanel.getByRole("button", { name: "Show assignment-backed rows from empty state" });
    const emptyStateWorkspaceShortcut = runnerAssignmentPanel.getByRole("button", { name: "Show workspace-backed rows from empty state" });
    const emptyStateUncompletedShortcut = runnerAssignmentPanel.getByRole("button", { name: "Show uncompleted rows from empty state" });
    await expect(emptyStateAssignmentShortcut).toHaveText(/Assignment-backed\s+0/);
    await expect(emptyStateWorkspaceShortcut).toHaveText(/Workspace-backed\s+1/);
    await expect(emptyStateUncompletedShortcut).toHaveText(/Uncompleted\s+45/);
    await expect(emptyStateAssignmentShortcut).toHaveAttribute("aria-describedby", "empty-state-assignment-shortcut-disabled-reason");
    await expect(emptyStateAssignmentShortcut).toHaveAttribute("aria-disabled", "true");
    await emptyStateAssignmentShortcut.focus();
    await expect(emptyStateAssignmentShortcut).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(emptyStateWorkspaceShortcut).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(emptyStateUncompletedShortcut).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(emptyStateResetFilters).toBeFocused();
    await emptyStateAssignmentShortcut.focus();
    await emptyStateAssignmentShortcut.press("Enter");
    await expect(assignmentRowFilters.getByLabel("Source completion")).toHaveValue("assignment");
    await emptyStateAssignmentShortcut.press("Space");
    await expect(assignmentRowFilters.getByLabel("Source completion")).toHaveValue("assignment");
    await expect(runnerAssignmentPanel.getByTestId("empty-state-shortcut-disabled-reasons")).toContainText(
      "Assignment-backed disabled: the empty-state shortcut already matches the current full-source filter, and 0 assignment-backed rows are available.",
    );
    await expect(emptyStateWorkspaceShortcut).toBeVisible();
    await expect(emptyStateUncompletedShortcut).toBeVisible();
    await emptyStateWorkspaceShortcut.focus();
    await expect(emptyStateWorkspaceShortcut).toBeFocused();
    await emptyStateWorkspaceShortcut.press("Enter");
    await expect(assignmentRowFilters.getByLabel("Classification")).toHaveValue("all");
    await expect(assignmentRowFilters.getByLabel("Source", { exact: true })).toHaveValue("all");
    await expect(assignmentRowFilters.getByLabel("Source completion")).toHaveValue("workspace");
    await expect(assignmentRowFilters.getByText(/Showing 1\/\d+ rows for All classifications from All sources with workspace source completion\./)).toBeVisible();
    await assignmentRowFilters.getByLabel("Source", { exact: true }).selectOption("lane");
    await expect(assignmentRowFilters.getByText(/Showing 0\/\d+ rows for All classifications from Lane assignment with workspace source completion\./)).toBeVisible();
    await expect(runnerAssignmentPanel.getByRole("button", { name: "Show workspace-backed rows from empty state" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    const transitionedAssignmentShortcut = runnerAssignmentPanel.getByRole("button", { name: "Show assignment-backed rows from empty state" });
    await expect(transitionedAssignmentShortcut).toHaveAttribute("aria-describedby", "empty-state-assignment-shortcut-disabled-reason");
    await expect(transitionedAssignmentShortcut).toHaveAttribute("aria-disabled", "true");
    await expect(runnerAssignmentPanel.getByTestId("empty-state-shortcut-disabled-reasons")).toContainText(
      "Assignment-backed unavailable: 0 assignment-backed rows are available.",
    );
    await transitionedAssignmentShortcut.focus();
    await expect(transitionedAssignmentShortcut).toBeFocused();
    await transitionedAssignmentShortcut.press("Enter");
    await expect(assignmentRowFilters.getByLabel("Source", { exact: true })).toHaveValue("lane");
    await expect(assignmentRowFilters.getByLabel("Source completion")).toHaveValue("workspace");
    await transitionedAssignmentShortcut.press("Space");
    await expect(assignmentRowFilters.getByLabel("Source", { exact: true })).toHaveValue("lane");
    await expect(assignmentRowFilters.getByLabel("Source completion")).toHaveValue("workspace");
    await emptyStateWorkspaceShortcut.focus();
    await expect(emptyStateWorkspaceShortcut).toBeFocused();
    await emptyStateWorkspaceShortcut.press("Enter");
    await expect(assignmentRowFilters.getByLabel("Classification")).toHaveValue("all");
    await expect(assignmentRowFilters.getByLabel("Source", { exact: true })).toHaveValue("all");
    await expect(assignmentRowFilters.getByLabel("Source completion")).toHaveValue("workspace");
    await expect(assignmentRowFilters.getByText(/Showing 1\/\d+ rows for All classifications from All sources with workspace source completion\./)).toBeVisible();
    await assignmentBackedPreset.click();
    await expect(assignmentRowFilters.getByText(/Showing 0\/\d+ rows for All classifications from All sources with assignment source completion\./)).toBeVisible();
    await emptyStateUncompletedShortcut.click();
    await expect(assignmentRowFilters.getByLabel("Classification")).toHaveValue("all");
    await expect(assignmentRowFilters.getByLabel("Source", { exact: true })).toHaveValue("all");
    await expect(assignmentRowFilters.getByLabel("Source completion")).toHaveValue("none");
    await expect(assignmentRowFilters.getByText(/Showing \d+\/\d+ rows for All classifications from All sources with no source completion\./)).toBeVisible();
    await assignmentBackedPreset.click();
    await expect(emptyStateResetFilters).toBeEnabled();
    await emptyStateResetFilters.click();
    await expect(assignmentRowFilters.getByLabel("Classification")).toHaveValue("attention");
    await expect(assignmentRowFilters.getByLabel("Source", { exact: true })).toHaveValue("all");
    await expect(assignmentRowFilters.getByLabel("Source completion")).toHaveValue("all");
    await expect(assignmentRowFilters.getByText(/Showing \d+\/\d+ rows for Needs attention from All sources with all source-completion states\./)).toBeVisible();
    await workspaceBackedPreset.click();
    await expect(assignmentRowFilters.getByLabel("Source completion")).toHaveValue("workspace");
    await expect(assignmentRowFilters.getByText(/Showing 1\/\d+ rows for All classifications from All sources with workspace source completion\./)).toBeVisible();
    await expect(filteredSourceSummary.getByText("Source completion: assignment 0, workspace 1, none 0", { exact: true })).toBeVisible();
    await assignmentRowFilters.getByLabel("Source", { exact: true }).selectOption("lane");
    await expect(assignmentRowFilters.getByText(/Showing 0\/\d+ rows for All classifications from Lane assignment with workspace source completion\./)).toBeVisible();
    await expect(
      runnerAssignmentPanel.getByText(
        "No assignment rows match the current filters. This workspace-backed view has 0 rows. Switch to Assignment-backed or Uncompleted, or reset filters before deciding the queue is empty.",
      ),
    ).toBeVisible();
    await uncompletedPreset.click();
    await expect(assignmentRowFilters.getByLabel("Source completion")).toHaveValue("none");
    await expect(assignmentRowFilters.getByText(/Showing \d+\/\d+ rows for All classifications from All sources with no source completion\./)).toBeVisible();
    await expect(filteredSourceSummary.getByText(/Source completion: assignment 0, workspace 0, none \d+/)).toBeVisible();
    await assignmentRowFilters.getByLabel("Classification").selectOption("active");
    await assignmentRowFilters.getByLabel("Source", { exact: true }).selectOption("backlog");
    await expect(assignmentRowFilters.getByText(/Showing 0\/\d+ rows for active from Backlog with no source completion\./)).toBeVisible();
    await expect(
      runnerAssignmentPanel.getByText(
        "No assignment rows match the current filters. This uncompleted view has 0 rows. Switch to Assignment-backed or Workspace-backed, or reset filters before deciding the queue is empty.",
      ),
    ).toBeVisible();
    await assignmentRowFilters.getByLabel("Classification").selectOption("closed");
    await assignmentRowFilters.getByLabel("Source", { exact: true }).selectOption("lane");
    await assignmentRowFilters.getByLabel("Source completion").selectOption("all");
    await expect(assignmentRowFilters.getByText(/Showing [1-9]\d*\/\d+ rows for closed from Lane assignment with all source-completion states\./)).toBeVisible();
    await expect(
      runnerAssignmentPanel
        .locator("article")
        .filter({ hasText: "codex/dispatcher-cleanup-assignment-closure-refresh" })
        .getByText("source: Lane assignment"),
    ).toBeVisible();
    await expect(runnerAssignmentPanel.getByText("Candidate: dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-keyboard-loop-refresh")).toBeVisible();
    await assignmentRowFilters.getByLabel("Classification").selectOption("attention");
    await assignmentRowFilters.getByLabel("Source", { exact: true }).selectOption("all");
    await expect(runnerAssignmentPanel.getByText("Resume packet")).toBeVisible();
    await expect(runnerAssignmentPanel.getByText("Lifecycle: prepared", { exact: true })).toBeVisible();
    await expect(runnerAssignmentPanel.getByText("Recovery action: resume-prepared-handoff", { exact: true })).toBeVisible();
    await expect(runnerAssignmentPanel.getByText("Queue counts: available", { exact: true })).toBeVisible();
    const handoffAuditTrail = runnerAssignmentPanel.getByTestId("handoff-audit-trail").first();
    await expect(handoffAuditTrail.getByText("Handoff audit trail", { exact: true })).toBeVisible();
    await expect(handoffAuditTrail.getByText("Audit query: 1/1", { exact: true })).toBeVisible();
    await expect(handoffAuditTrail.getByText("Audit #1: complete; lifecycle not-applicable; recovery no-action")).toBeVisible();
    await expect(handoffAuditTrail.getByText("Readiness evidence: passed via node ./scripts/codex-workspace.mjs doctor")).toBeVisible();
    await expect(handoffAuditTrail.getByText("Queue evidence: available", { exact: true })).toBeVisible();
    await expect(handoffAuditTrail.getByText("Retention: metadata-only; payload not-retained", { exact: true })).toBeVisible();
    await expect(handoffAuditTrail.getByText("Retention summary: metadata-only audit entry; raw prompts, completions, provider payloads, reasoning traces, secrets, and source copies are not retained.")).toBeVisible();
    await expect(handoffAuditTrail.getByText("Audit stop: no automatic takeover without evidence and approval")).toBeVisible();
    await expect(handoffAuditTrail.locator("p").getByText("complete handoff packet; readiness passed; queue counts available; stop lines 2.", { exact: true })).toBeVisible();
    await expect(handoffAuditTrail.getByText("Filtered audit export", { exact: true })).toBeVisible();
    await expect(handoffAuditTrail.getByLabel("Filtered audit export")).toContainText("entries: 1/1");
    await expect(handoffAuditTrail.getByLabel("Filtered audit export")).toContainText("payload=not-retained");
    await expect(handoffAuditTrail.getByLabel("Filtered audit export")).toContainText("retention: metadata-only");
    await expect(handoffAuditTrail.getByText(/filename: handoff-audit-.*-1-of-1\.txt/)).toBeVisible();
    await expect(handoffAuditTrail.getByText(/json filename: handoff-audit-.*-1-of-1\.json/)).toBeVisible();
    await expect(handoffAuditTrail.getByText("JSON validation: schema v1 metadata-only; retained fields 21.")).toBeVisible();
    await expect(handoffAuditTrail.getByLabel("Filtered audit JSON export")).toContainText('"schemaId": "kendall.runner-handoff-audit.filtered-export.v1"');
    await expect(handoffAuditTrail.getByLabel("Filtered audit JSON export")).toContainText('"schemaVersion": 1');
    await expect(handoffAuditTrail.getByLabel("Filtered audit JSON export")).toContainText('"exportKind": "filtered-handoff-audit"');
    await expect(handoffAuditTrail.getByLabel("Filtered audit JSON export")).toContainText('"payload": "not-retained"');
    await expect(handoffAuditTrail.getByLabel("Filtered audit JSON export")).toContainText('"retainedEntryFields"');
    await expect(handoffAuditTrail.getByText("active: 1", { exact: true })).toBeVisible();
    await expect(handoffAuditTrail.getByText("blocked authority: 1", { exact: true })).toBeVisible();
    await expect(handoffAuditTrail.getByText("blocked owned active: 1", { exact: true })).toBeVisible();
    await expect(handoffAuditTrail.getByText("closed: 9", { exact: true })).toBeVisible();
    await handoffAuditTrail.getByLabel("Evidence").selectOption("complete");
    await handoffAuditTrail.getByLabel("Payload").selectOption("not-retained");
    await handoffAuditTrail.getByLabel("Query").fill("doctor");
    await expect(handoffAuditTrail.getByText("Audit query: 1/1", { exact: true })).toBeVisible();
    await handoffAuditTrail.getByRole("button", { name: "Copy summary" }).click();
    await expect(handoffAuditTrail.getByText(/Copy prepared for 1 audit entry\.|Copied 1 audit entry\.|Copy unavailable; select summary text\./)).toBeVisible();
    const auditDownloadPromise = page.waitForEvent("download");
    await handoffAuditTrail.getByRole("button", { name: "Download .txt" }).click();
    const auditDownload = await auditDownloadPromise;
    expect(auditDownload.suggestedFilename()).toMatch(/^handoff-audit-.*-1-of-1\.txt$/);
    const auditDownloadPath = await auditDownload.path();
    expect(auditDownloadPath).toBeTruthy();
    const auditDownloadText = await fs.readFile(auditDownloadPath!, "utf8");
    expect(auditDownloadText).toContain("Filtered handoff audit export");
    expect(auditDownloadText).toContain("payload=not-retained");
    expect(auditDownloadText).toContain("retention: metadata-only");
    await expect(handoffAuditTrail.getByText("Download prepared for 1 audit entry.")).toBeVisible();
    const auditJsonDownloadPromise = page.waitForEvent("download");
    await handoffAuditTrail.getByRole("button", { name: "Download .json" }).click();
    const auditJsonDownload = await auditJsonDownloadPromise;
    expect(auditJsonDownload.suggestedFilename()).toMatch(/^handoff-audit-.*-1-of-1\.json$/);
    const auditJsonDownloadPath = await auditJsonDownload.path();
    expect(auditJsonDownloadPath).toBeTruthy();
    const auditJsonDownloadPayload = JSON.parse(await fs.readFile(auditJsonDownloadPath!, "utf8"));
    expect(auditJsonDownloadPayload).toMatchObject({
      schemaId: "kendall.runner-handoff-audit.filtered-export.v1",
      schemaVersion: 1,
      exportKind: "filtered-handoff-audit",
      retention: {
        policy: "metadata-only",
        payload: "not-retained",
      },
      schema: {
        metadataContract: "generated-worker-handoff-audit-metadata-only",
        requiredTopLevelFields: ["schemaId", "schemaVersion", "exportKind", "retention", "schema", "entries", "filters", "auditTrail"],
      },
      entries: {
        filtered: 1,
        total: 1,
      },
      filters: {
        query: "doctor",
        evidence: "complete",
        payload: "not-retained",
      },
    });
    expect(auditJsonDownloadPayload.auditTrail[0]).toMatchObject({
      evidenceStatus: "complete",
      payloadRetention: "not-retained",
      retentionPolicy: "metadata-only",
    });
    expect(auditJsonDownloadPayload.schema.requiredTopLevelFields).toEqual(["schemaId", "schemaVersion", "exportKind", "retention", "schema", "entries", "filters", "auditTrail"]);
    expect(auditJsonDownloadPayload.schema.retainedEntryFields).toEqual([
      "sequence",
      "lane",
      "branch",
      "taskId",
      "workspaceAction",
      "nextCommand",
      "generatedAt",
      "readinessStatus",
      "readinessCommand",
      "readinessSummary",
      "queueCountsStatus",
      "queueCounts",
      "stopLines",
      "lifecycleState",
      "recoveryAction",
      "recoverySummary",
      "evidenceStatus",
      "evidenceSummary",
      "retentionPolicy",
      "payloadRetention",
      "retentionSummary",
    ]);
    expect(Object.keys(auditJsonDownloadPayload.auditTrail[0]).sort()).toEqual([...auditJsonDownloadPayload.schema.retainedEntryFields].sort());
    expect(auditJsonDownloadPayload.entries.total).toBe(1);
    expect(auditJsonDownloadPayload.schema.retainedEntryFields).toContain("evidenceStatus");
    expect(auditJsonDownloadPayload.schema.retainedEntryFields).toContain("payloadRetention");
    await expect(handoffAuditTrail.getByText("JSON download prepared for 1 audit entry.")).toBeVisible();
    await handoffAuditTrail.getByLabel("Query").fill("not-present-in-audit");
    await expect(handoffAuditTrail.getByText("Audit query: 0/1", { exact: true })).toBeVisible();
    await expect(handoffAuditTrail.getByText("No audit entries match the current query.")).toBeVisible();
    await expect(handoffAuditTrail.getByLabel("Filtered audit export")).toContainText("No filtered audit entries to export.");
    await expect(handoffAuditTrail.getByText(/filename: handoff-audit-.*-0-of-1\.txt/)).toBeVisible();
    await expect(handoffAuditTrail.getByText(/json filename: handoff-audit-.*-0-of-1\.json/)).toBeVisible();
    await expect(handoffAuditTrail.getByLabel("Filtered audit JSON export")).toContainText('"filtered": 0');

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

    const githubPolicyPanel = page.locator("section").filter({ hasText: "Git Credential Manager" }).first();
    await expect(githubPolicyPanel.getByText("GitHub workflow", { exact: true })).toBeVisible();
    await expect(githubPolicyPanel.getByText("Git remotes use Git Credential Manager")).toBeVisible();
    await expect(githubPolicyPanel.getByText("Codex GitHub connector handles PR work")).toBeVisible();
    await expect(githubPolicyPanel.getByText("pnpm run doctor:github -- --remote")).toBeVisible();
    await expect(githubPolicyPanel.getByText("Plaintext tokens")).toBeVisible();
    await expect(githubPolicyPanel.getByText("Do not create persistent plaintext GitHub CLI tokens")).toBeVisible();
    await expect(page.locator("#github-workflow-policy-report")).toBeVisible();

    const githubDeliveryPanel = page.locator("#github-delivery-authority-report");
    await expect(githubDeliveryPanel.getByText("GitHub delivery", { exact: true })).toBeVisible();
    await expect(githubDeliveryPanel.getByRole("heading", { name: "Delivery authority ladder" })).toBeVisible();
    await expect(githubDeliveryPanel.getByRole("heading", { name: "Push branch" })).toBeVisible();
    await expect(githubDeliveryPanel.getByRole("heading", { name: "Open or update PR" })).toBeVisible();
    await expect(githubDeliveryPanel.getByRole("heading", { name: "Wait for CI" })).toBeVisible();
    await expect(githubDeliveryPanel.getByRole("heading", { name: "Merge PR" })).toBeVisible();
    await expect(githubDeliveryPanel.getByText("branch-scoped push approval")).toBeVisible();
    await expect(githubDeliveryPanel.getByText("Use this ladder to request one delivery step at a time.")).toBeVisible();
    await expect(page.locator("#github-delivery-authority-report")).toBeVisible();

    const trustedDeliveryEligibilityPanel = page.locator("#trusted-delivery-eligibility-report");
    await expect(trustedDeliveryEligibilityPanel.getByText("Trusted delivery", { exact: true })).toBeVisible();
    await expect(trustedDeliveryEligibilityPanel.getByRole("heading", { name: "Eligibility evaluator" })).toBeVisible();
    await expect(trustedDeliveryEligibilityPanel.getByRole("heading", { name: "Push and PR" })).toBeVisible();
    await expect(trustedDeliveryEligibilityPanel.getByRole("heading", { name: "CI and review" })).toBeVisible();
    await expect(trustedDeliveryEligibilityPanel.getByRole("heading", { name: "Merge" })).toBeVisible();
    await expect(trustedDeliveryEligibilityPanel.getByRole("heading", { name: "Cleanup" })).toBeVisible();
    await expect(trustedDeliveryEligibilityPanel.getByText("No automatic operation allowed.").first()).toBeVisible();
    await expect(trustedDeliveryEligibilityPanel.getByText("Local check evidence", { exact: true })).toBeVisible();
    await expect(page.locator("#trusted-delivery-eligibility-report")).toBeVisible();

    const gitHygienePanel = page.locator("section").filter({ hasText: "Repository readiness" }).first();
    await expect(gitHygienePanel.getByText("Git hygiene", { exact: true })).toBeVisible();
    await expect(gitHygienePanel.getByText("Repository readiness")).toBeVisible();
    await expect(gitHygienePanel.getByRole("heading", { name: "Working tree" })).toBeVisible();
    await expect(gitHygienePanel.getByRole("heading", { name: "Current branch" })).toBeVisible();
    await expect(gitHygienePanel.getByRole("heading", { name: "Worktree inventory" })).toBeVisible();
    await expect(gitHygienePanel.getByRole("heading", { name: "PR and CI" })).toBeVisible();
    await expect(gitHygienePanel.getByText("No GitHub PR lookup was performed by this read-only local report.")).toBeVisible();
    await expect(gitHygienePanel.getByText("This report is not approval to push")).toBeVisible();
    await expect(page.locator("#git-hygiene-report")).toBeVisible();

    const cleanupPanel = page.locator("#local-cleanup-readiness-report");
    await expect(cleanupPanel.getByText("Local cleanup", { exact: true })).toBeVisible();
    await expect(cleanupPanel.getByRole("heading", { name: "Cleanup readiness" })).toBeVisible();
    await expect(cleanupPanel.getByRole("heading", { name: "Completed worktree" })).toBeVisible();
    await expect(cleanupPanel.getByRole("heading", { name: "Stale worktree" })).toBeVisible();
    await expect(cleanupPanel.getByRole("heading", { name: "Evidence retention" })).toBeVisible();
    await expect(cleanupPanel.getByRole("heading", { name: "Blocked targets" })).toBeVisible();
    await expect(cleanupPanel.getByText("main repository checkout")).toBeVisible();
    await expect(cleanupPanel.getByText("Use this report to request one local cleanup target at a time.")).toBeVisible();
    await expect(page.locator("#local-cleanup-readiness-report")).toBeVisible();

    const remoteCleanupPanel = page.locator("#remote-cleanup-sync-readiness-report");
    await expect(remoteCleanupPanel.getByText("Remote cleanup", { exact: true })).toBeVisible();
    await expect(remoteCleanupPanel.getByRole("heading", { name: "Remote sync readiness" })).toBeVisible();
    await expect(remoteCleanupPanel.getByRole("heading", { name: "Remote branch cleanup" })).toBeVisible();
    await expect(remoteCleanupPanel.getByRole("heading", { name: "Issue sync" })).toBeVisible();
    await expect(remoteCleanupPanel.getByRole("heading", { name: "Story status sync" })).toBeVisible();
    await expect(remoteCleanupPanel.getByText("GitHub tokens")).toBeVisible();
    await expect(remoteCleanupPanel.getByText("Use this report to request one remote cleanup or sync target at a time.")).toBeVisible();
    await expect(page.locator("#remote-cleanup-sync-readiness-report")).toBeVisible();

    const autonomyPanel = page.locator("#trusted-autonomy-readiness-report");
    await expect(autonomyPanel.getByText("Trusted autonomy", { exact: true })).toBeVisible();
    await expect(autonomyPanel.getByRole("heading", { name: "Autonomy readiness" })).toBeVisible();
    await expect(autonomyPanel.getByRole("heading", { name: "Repeatable low-risk work" })).toBeVisible();
    await expect(autonomyPanel.getByRole("heading", { name: "Automatic stop" })).toBeVisible();
    await expect(autonomyPanel.getByRole("heading", { name: "Blocked work" })).toBeVisible();
    await expect(autonomyPanel.getByText("Codex or Claude launch without explicit authority")).toBeVisible();
    await expect(autonomyPanel.getByText("Use this report to select one narrow workflow class for a future autonomy trial.")).toBeVisible();
    await expect(page.locator("#trusted-autonomy-readiness-report")).toBeVisible();

    const epicCompletionPanel = page.locator("#epic-6-completion-audit-report");
    await expect(epicCompletionPanel.getByText("Epic 6 audit", { exact: true })).toBeVisible();
    await expect(epicCompletionPanel.getByRole("heading", { name: "Completion status" })).toBeVisible();
    await expect(epicCompletionPanel.getByText("Overall", { exact: true })).toBeVisible();
    await expect(epicCompletionPanel.getByText("Epic complete", { exact: true })).toBeVisible();
    await expect(epicCompletionPanel.getByText("Remote delivery", { exact: true })).toBeVisible();
    await expect(epicCompletionPanel.getByText("Cleanup", { exact: true })).toBeVisible();
    await expect(epicCompletionPanel.getByRole("heading", { name: "Prepared" })).toBeVisible();
    await expect(epicCompletionPanel.getByRole("heading", { name: "Remaining" })).toBeVisible();
    await expect(epicCompletionPanel.getByRole("heading", { name: "Blocked operations" })).toBeVisible();
    await expect(epicCompletionPanel.getByRole("heading", { name: "Required evidence" })).toBeVisible();
    await expect(page.locator("#epic-6-completion-audit-report")).toBeVisible();

    const mvpProofPanel = page.locator("#epic-6-mvp-proof-trial-report");
    await expect(mvpProofPanel.getByText("MVP proof", { exact: true })).toBeVisible();
    await expect(mvpProofPanel.getByRole("heading", { name: "Trial packet" })).toBeVisible();
    await expect(mvpProofPanel.getByRole("heading", { name: "Bounded Codex implementation" })).toBeVisible();
    await expect(mvpProofPanel.getByRole("heading", { name: "Bounded Claude review" })).toBeVisible();
    await expect(mvpProofPanel.getByRole("heading", { name: "GitHub delivery" })).toBeVisible();
    await expect(mvpProofPanel.getByText("Trial status", { exact: true })).toBeVisible();
    await expect(mvpProofPanel.getByRole("heading", { name: "Approval packets" })).toBeVisible();
    await expect(mvpProofPanel.getByRole("heading", { name: "Blocked operations" })).toBeVisible();
    await expect(mvpProofPanel.getByRole("heading", { name: "Next safe actions" })).toBeVisible();
    await expect(page.locator("#epic-6-mvp-proof-trial-report")).toBeVisible();

    const codexReadinessPanel = page.locator("section").filter({ hasText: "No-launch readiness" }).first();
    await expect(codexReadinessPanel.getByText("Codex readiness", { exact: true })).toBeVisible();
    await expect(codexReadinessPanel.getByRole("heading", { name: "No-launch readiness" })).toBeVisible();
    await expect(codexReadinessPanel.getByRole("heading", { name: "CLI discovery" })).toBeVisible();
    await expect(codexReadinessPanel.getByRole("heading", { name: "Auth posture" })).toBeVisible();
    await expect(codexReadinessPanel.getByRole("heading", { name: "Worker launch" })).toBeVisible();
    await expect(codexReadinessPanel.getByText("This report does not approve Codex CLI process launch.")).toBeVisible();
    await expect(page.locator("#codex-readiness-report")).toBeVisible();

    const codexImplementationPanel = page.locator("#codex-implementation-approval-report");
    await expect(codexImplementationPanel.getByText("Codex implementation", { exact: true })).toBeVisible();
    await expect(codexImplementationPanel.getByRole("heading", { name: "Approval packet" })).toBeVisible();
    await expect(codexImplementationPanel.getByText("Approve one bounded Codex implementation attempt")).toBeVisible();
    await expect(codexImplementationPanel.getByRole("heading", { name: "Isolated worktree" })).toBeVisible();
    await expect(codexImplementationPanel.getByRole("heading", { name: "Path scope" })).toBeVisible();
    await expect(codexImplementationPanel.getByRole("heading", { name: "Approval binding" })).toBeVisible();
    await expect(codexImplementationPanel.getByText("codex <non-interactive task mode> --cwd <approved-worktree>")).toBeVisible();
    await expect(codexImplementationPanel.getByText("Codex asks for credentials")).toBeVisible();
    await expect(page.locator("#codex-implementation-approval-report")).toBeVisible();

    const claudeReviewPanel = page.locator("#claude-review-readiness-report");
    await expect(claudeReviewPanel.getByText("Claude review", { exact: true })).toBeVisible();
    await expect(claudeReviewPanel.getByRole("heading", { name: "No-launch review readiness" })).toBeVisible();
    await expect(claudeReviewPanel.getByRole("heading", { name: "CLI discovery" })).toBeVisible();
    await expect(claudeReviewPanel.getByRole("heading", { name: "Review-only posture" })).toBeVisible();
    await expect(claudeReviewPanel.getByRole("heading", { name: "Scarce use" })).toBeVisible();
    await expect(claudeReviewPanel.getByText("This report does not approve Claude CLI process launch.")).toBeVisible();
    await expect(claudeReviewPanel.getByText("scarce Claude subscription usage")).toBeVisible();
    await expect(page.locator("#claude-review-readiness-report")).toBeVisible();

    const claudeApprovalPanel = page.locator("#claude-review-approval-report");
    await expect(claudeApprovalPanel.getByText("Claude review approval", { exact: true })).toBeVisible();
    await expect(claudeApprovalPanel.getByRole("heading", { name: "Review-only approval packet" })).toBeVisible();
    await expect(claudeApprovalPanel.getByText("Approve one bounded Claude review-only attempt")).toBeVisible();
    await expect(claudeApprovalPanel.getByRole("heading", { name: "Explicit request" })).toBeVisible();
    await expect(claudeApprovalPanel.getByRole("heading", { name: "Routine generation" })).toBeVisible();
    await expect(claudeApprovalPanel.getByRole("heading", { name: "Blocked inputs" })).toBeVisible();
    await expect(claudeApprovalPanel.getByText("Risk-ranked findings")).toBeVisible();
    await expect(claudeApprovalPanel.getByText("One Claude review attempt per approval")).toBeVisible();
    await expect(page.locator("#claude-review-approval-report")).toBeVisible();

    const deliveryReadinessPolicyPanel = page.locator("section").filter({ hasText: "Review gate policy" }).first();
    await expect(deliveryReadinessPolicyPanel.getByText("Delivery readiness", { exact: true })).toBeVisible();
    await expect(deliveryReadinessPolicyPanel.getByText("Pull request evidence")).toBeVisible();
    await expect(deliveryReadinessPolicyPanel.getByText("CI evidence")).toBeVisible();
    await expect(deliveryReadinessPolicyPanel.getByText("Local-only delivery waiver")).toBeVisible();
    await expect(deliveryReadinessPolicyPanel.getByText("Record delivery readiness only through the work-item delivery readiness checkpoint form.")).toBeVisible();
    await expect(page.locator("#delivery-readiness-policy-report")).toBeVisible();

    const fleetPanel = page.locator("#routing-fleet");
    await expect(fleetPanel.getByText("Routing Fleet")).toBeVisible();
    await expect(fleetPanel.getByText("Internal utility worker")).toBeVisible();
    await expect(fleetPanel.getByText("Premium approval lane")).toBeVisible();
    await expect(fleetPanel.getByText("Workers online")).toBeVisible();
    await expect(fleetPanel.getByText("Lane evidence")).toBeVisible();
    await expect(fleetPanel.getByText("Decisions 1")).toBeVisible();
    await expect(fleetPanel.getByText("Task Deterministic Check")).toBeVisible();
  });

  test("runs a safe local check from the work item detail page", async ({ page, request }) => {
    const workItemId = await createWorkItem(request, {
      title: "Local evidence check",
      requestedOutcome: "Summarize the available workflow evidence without changing files or running commands.",
    });

    await page.goto(`/work-items/${workItemId}`);

    const localCheck = page.locator("#local-check");
    await expect(localCheck.getByRole("heading", { name: "Ask the local lane to explain this work" })).toBeVisible();
    await expect(localCheck.getByText("Changes off")).toBeVisible();
    await expect(localCheck.getByText("Commands off")).toBeVisible();

    await localCheck.getByRole("button", { name: "Run local check" }).click();

    await expect(localCheck.getByText("Local read-only", { exact: true })).toBeVisible();
    await expect(localCheck.getByText("No model call was made. This check used existing work evidence only.")).toBeVisible();
    await expect(localCheck.getByText("Read-only explanation only; file writes are not allowed.")).toBeVisible();
  });

  test("guides a non-coder through intake templates and advanced fields", async ({ page }) => {
    await page.goto("/controls");

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

    await page.goto("/queue");

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
    await expect(overviewPanel.getByRole("heading", { name: "Cross-check path" })).toBeVisible();
    await expect(overviewPanel.getByRole("link", { name: /Authority boundary/ }).first()).toHaveAttribute(
      "href",
      "/controls#execution-readiness-report",
    );
    await expect(overviewPanel.getByText("Confirm review work does not grant execution")).toBeVisible();
    await expect(overviewPanel.getByRole("heading", { name: "Review queue position" })).toBeVisible();
    await expect(overviewPanel.getByRole("link", { name: "Open review index" })).toHaveAttribute(
      "href",
      "/controls#runtime-evidence-review-report",
    );
    await expect(overviewPanel.getByText("Evidence counts")).toBeVisible();
    await expect(overviewPanel.getByText("related reports indexed")).toBeVisible();
    await expect(overviewPanel.getByText("Recommended action")).toBeVisible();
    await expect(overviewPanel.getByText("Review queue shortcuts are not execution-authority approvals.")).toBeVisible();
    await expect(overviewPanel.getByRole("heading", { name: "Review shortcuts" })).toBeVisible();
    await expect(overviewPanel.getByRole("link", { name: /Runtime state/ })).toBeVisible();
    await expect(overviewPanel.getByRole("link").filter({ hasText: "review-authority-boundary" })).toBeVisible();
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
    await expect(exportPanel.getByRole("link", { name: /Documentation authority/ }).first()).toHaveAttribute(
      "href",
      "/controls#documentation-authority-report",
    );
    await expect(exportPanel.getByText("cancel_requested -> request_abort_recorded")).toBeVisible();
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

  test("shows subscription launch readiness without execution controls on work item detail", async ({ page, request }) => {
    test.setTimeout(60_000);
    const noEvidenceWorkItemId = await createWorkItem(request, {
      title: "Subscription launch no evidence",
      requestedOutcome: "Verify the subscription launch readiness panel starts from missing evidence.",
      source: "operator-dashboard:improvement",
      riskLevel: "medium",
      metadata: {
        executionRecipeId: "dashboard-test-coverage",
        intakeTemplateId: "operator-test-coverage",
      },
    });

    await page.goto(`/work-items/${noEvidenceWorkItemId}`);
    await page.getByRole("link", { name: "Launch readiness", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/work-items/${noEvidenceWorkItemId}#subscription-launch-readiness$`));

    const emptyPanel = page.locator("#subscription-launch-readiness");
    await expect(emptyPanel.getByText("Subscription launch readiness")).toBeVisible();
    await expect(emptyPanel.getByText("No subscription launch evidence has been recorded.")).toBeVisible();
    await expect(emptyPanel.getByText("Create disabled launch stub evidence before requesting exact launch approval.")).toBeVisible();
    await expect(emptyPanel.getByRole("button")).toHaveCount(0);

    const workItemId = await createWorkItem(request, {
      title: "Subscription launch readiness panel",
      requestedOutcome: "Verify disabled subscription launch readiness and blocked approvals are visible.",
      source: "operator-dashboard:improvement",
      riskLevel: "medium",
      metadata: {
        executionRecipeId: "dashboard-test-coverage",
        intakeTemplateId: "operator-test-coverage",
      },
    });
    await createSubscriptionLaunchStubEvent(request, workItemId, "codex");

    await page.goto(`/work-items/${workItemId}`);
    await page.getByRole("link", { name: "Launch readiness", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/work-items/${workItemId}#subscription-launch-readiness$`));

    const launchPanel = page.locator("#subscription-launch-readiness");
    await expect(launchPanel).toBeInViewport();
    await expect(launchPanel.getByText("Launch blocked")).toBeVisible();
    await expect(launchPanel.getByText("Readiness only")).toBeVisible();
    await expect(launchPanel.getByText("subscription_agent_process_launch_not_enabled")).toBeVisible();
    await expect(launchPanel.getByText("blocked_pending_exact_launch_approval").first()).toBeVisible();
    await expect(launchPanel.getByText("epic-8-first-subscription-launch-policy-v1")).toBeVisible();
    await expect(launchPanel.getByText("codex.subscription.disabled")).toBeVisible();
    await expect(launchPanel.getByText("codex-subscription-cli-template-disabled-v1")).toBeVisible();
    await expect(launchPanel.getByText("commandTemplateExecutable: false")).toBeVisible();
    await expect(launchPanel.getByText("approvalActor", { exact: true })).toBeVisible();
    await expect(launchPanel.getByText("approvalTimestamp", { exact: true })).toBeVisible();
    await expect(launchPanel.getByText("approvalExpiry", { exact: true })).toBeVisible();
    await expect(launchPanel.getByText("permissionEnvelope: not_approved_for_real_launch")).toBeVisible();
    await expect(launchPanel.getByText("commandTemplateExecutionStatus: not_executable_by_kendall")).toBeVisible();
    await expect(launchPanel.getByText("Fill approvalActor before exact launch approval can be requested.")).toBeVisible();
    await expect(launchPanel.getByText("heartbeat_metadata_only_no_process_polling")).toBeVisible();
    await expect(launchPanel.getByText("planned -> disabled_precheck_recorded")).toBeVisible();
    await expect(launchPanel.getByText("running -> simulated_running_rejected_without_spawn")).toBeVisible();
    await expect(launchPanel.getByText("terminalState: timed_out")).toBeVisible();
    await expect(launchPanel.getByText("terminalState: completed")).toBeVisible();
    await expect(launchPanel.getByText("no_child_process_tree_created_tracking_metadata_only")).toBeVisible();
    await expect(launchPanel.getByText("orphan_detection_records_no_process_tree_to_scan")).toBeVisible();
    await expect(launchPanel.getByText("terminal_reconciliation_metadata_only_without_process_status")).toBeVisible();
    await expect(launchPanel.getByText("cleanup_is_metadata_only_and_idempotent_without_deletion")).toBeVisible();
    await expect(launchPanel.getByText("rollback_records_global_disable_without_resource_deletion")).toBeVisible();
    await expect(launchPanel.getByText("artifactReferenceOnly: true")).toBeVisible();
    await expect(launchPanel.getByText("workflowEventRawOutputAllowed: false")).toBeVisible();
    await expect(launchPanel.getByText("rawOutputStored: false")).toBeVisible();
    await expect(launchPanel.getByText("simulated_output_summary")).toBeVisible();
    await expect(launchPanel.getByText("simulated_generated_patch")).toBeVisible();
    await expect(launchPanel.getByText("Raw stdout, stderr, and generated patch contents remain excluded.")).toBeVisible();
    await expect(launchPanel.getByText("Process launch: disabled")).toBeVisible();
    await expect(launchPanel.getByText("Execution: disabled")).toBeVisible();
    await expect(launchPanel.getByText("Shell execution: not attempted")).toBeVisible();
    await expect(launchPanel.getByText("Credentials: not attempted")).toBeVisible();
    await expect(launchPanel.getByText("External sends: not attempted")).toBeVisible();
    await expect(launchPanel.getByRole("button")).toHaveCount(0);
    await expect(launchPanel.getByText("rawStdout")).toHaveCount(0);
    await expect(launchPanel.getByText("rawStderr")).toHaveCount(0);
    await expect(launchPanel.getByText("generatedPatch", { exact: true })).toHaveCount(0);

    const exportPanel = page.locator("#runtime-evidence-export");
    await exportPanel.scrollIntoViewIfNeeded();
    await expect(exportPanel.getByRole("heading", { name: "Subscription launch evidence" })).toBeVisible();
    await expect(exportPanel.getByText("rawOutputStored: false")).toHaveCount(0);
    await expect(exportPanel.getByText("Raw output stored")).toBeVisible();
    await expect(exportPanel.getByText("false", { exact: true }).first()).toBeVisible();
    await expect(exportPanel.getByText("rawStdout")).toHaveCount(0);
    await expect(exportPanel.getByText("rawStderr")).toHaveCount(0);
    await expect(exportPanel.getByText("generatedPatch", { exact: true })).toHaveCount(0);
  });

  test("shows rejected subscription launch request evidence without raw output or launch controls", async ({ page, request }) => {
    const workItemId = await createWorkItem(request, {
      title: "Subscription launch rejected request",
      requestedOutcome: "Verify exact approval rejection is visible without launching a process.",
      source: "operator-dashboard:improvement",
      riskLevel: "medium",
      metadata: {
        executionRecipeId: "dashboard-test-coverage",
        intakeTemplateId: "operator-test-coverage",
      },
    });
    await createSubscriptionLaunchRejectionEvent(request, workItemId, "codex");

    await page.goto(`/work-items/${workItemId}`);
    await page.getByRole("link", { name: "Launch readiness", exact: true }).click();

    const launchPanel = page.locator("#subscription-launch-readiness");
    await expect(launchPanel.getByText("rejected_missing_exact_approval")).toBeVisible();
    await expect(launchPanel.getByText("blocked_pending_exact_launch_approval")).toBeVisible();
    await expect(launchPanel.getByText("Fill approvalActor before exact launch approval can be requested.")).toBeVisible();
    await expect(launchPanel.getByText("missing_approval_actor")).toBeVisible();
    await expect(launchPanel.getByText("real_process_launch_not_approved")).toBeVisible();
    await expect(launchPanel.getByText("artifactReferenceOnly: true")).toBeVisible();
    await expect(launchPanel.getByText("rawOutputStored: false")).toBeVisible();
    await expect(launchPanel.getByText("Process launch: disabled")).toBeVisible();
    await expect(launchPanel.getByText("Execution: disabled")).toBeVisible();
    await expect(launchPanel.getByText("Shell execution: not attempted")).toBeVisible();
    await expect(launchPanel.getByText("Credentials: not attempted")).toBeVisible();
    await expect(launchPanel.getByRole("button")).toHaveCount(0);
    await expect(launchPanel.getByText("rawStdout")).toHaveCount(0);
    await expect(launchPanel.getByText("rawStderr")).toHaveCount(0);
    await expect(launchPanel.getByText("generatedPatch", { exact: true })).toHaveCount(0);
  });

  test("shows expired exact subscription launch approval evidence without raw output or launch controls", async ({ page, request }) => {
    const workItemId = await createWorkItem(request, {
      title: "Subscription launch expired exact approval",
      requestedOutcome: "Verify the recorded exact approval expires instead of accepting a fresh fixture launch.",
      source: "operator-dashboard:improvement",
      riskLevel: "medium",
      metadata: {
        executionRecipeId: "dashboard-test-coverage",
        intakeTemplateId: "operator-test-coverage",
      },
    });
    await createSubscriptionLaunchExpiredExactApprovalEvent(request, workItemId, "codex");

    await page.goto(`/work-items/${workItemId}`);
    await page.getByRole("link", { name: "Launch readiness", exact: true }).click();

    const launchPanel = page.locator("#subscription-launch-readiness");
    await expect(launchPanel.getByText("rejected_stale_exact_approval")).toBeVisible();
    await expect(launchPanel.getByText("subscription_launch_approval_stale")).toBeVisible();
    await expect(launchPanel.getByText("approvalExpiry", { exact: true })).toBeVisible();
    await expect(launchPanel.getByText("approvalExpiry: expired")).toBeVisible();
    await expect(launchPanel.getByText("Refresh approvalExpiry before reusing any prior approval.")).toBeVisible();
    await expect(launchPanel.getByText("simulated_output_summary")).toBeVisible();
    await expect(launchPanel.getByText("simulated_generated_patch")).toBeVisible();
    await expect(launchPanel.getByText("artifactReferenceOnly: true")).toBeVisible();
    await expect(launchPanel.getByText("rawOutputStored: false")).toBeVisible();
    await expect(launchPanel.getByText("Process launch: disabled")).toBeVisible();
    await expect(launchPanel.getByText("Execution: disabled")).toBeVisible();
    await expect(launchPanel.getByText("Shell execution: not attempted")).toBeVisible();
    await expect(launchPanel.getByText("Credentials: not attempted")).toBeVisible();
    await expect(launchPanel.getByRole("button")).toHaveCount(0);
    await expect(launchPanel.getByText("rawStdout")).toHaveCount(0);
    await expect(launchPanel.getByText("rawStderr")).toHaveCount(0);
    await expect(launchPanel.getByText("generatedPatch", { exact: true })).toHaveCount(0);
  });

  test("shows subscription launch verification recovery and rollback evidence without controls", async ({ page, request }) => {
    test.setTimeout(60_000);
    const workItemId = await createWorkItem(request, {
      title: "Subscription launch verification rollback evidence",
      requestedOutcome: "Verify subscription launch verification and rollback evidence is visible without launch controls.",
      source: "operator-dashboard:improvement",
      riskLevel: "medium",
      metadata: {
        executionRecipeId: "dashboard-test-coverage",
        intakeTemplateId: "operator-test-coverage",
      },
    });
    await createSubscriptionLaunchExpiredExactApprovalEvent(request, workItemId, "codex");
    seedSubscriptionLaunchVerificationEvent(workItemId);

    await page.goto(`/work-items/${workItemId}`);
    await page.getByRole("link", { name: "Launch readiness", exact: true }).click();

    const launchPanel = page.locator("#subscription-launch-readiness");
    await expect(launchPanel.getByRole("heading", { name: "Verification and recovery" })).toBeVisible();
    await expect(launchPanel.getByText("subscription-launch-verification-failed")).toBeVisible();
    await expect(launchPanel.getByText("verification_failed")).toBeVisible();
    await expect(launchPanel.getByText("inspect retained subscription launch artifacts before retry or rollback")).toBeVisible();
    await expect(launchPanel.getByText("Keep subscription-agent launch disabled until the operator reviews retained artifacts.")).toBeVisible();
    await expect(launchPanel.getByRole("button")).toHaveCount(0);
    await expect(launchPanel.getByText("rawStdout")).toHaveCount(0);
    await expect(launchPanel.getByText("rawStderr")).toHaveCount(0);

    const exportPanel = page.locator("#runtime-evidence-export");
    await exportPanel.scrollIntoViewIfNeeded();
    await expect(exportPanel.getByRole("heading", { name: "Verification and recovery" })).toBeVisible();
    await expect(exportPanel.getByText("rollbackStatus: triggered")).toBeVisible();
    await expect(exportPanel.getByText("blockedReason: subscription-launch-verification-failed")).toBeVisible();
    await expect(exportPanel.getByText("nextSafeAction: Keep subscription-agent launch disabled until the operator reviews retained artifacts.")).toBeVisible();
    await expect(exportPanel.getByText("rawStdout")).toHaveCount(0);
    await expect(exportPanel.getByText("rawStderr")).toHaveCount(0);
  });

  test("hides synthetic provider raw output while showing bounded metadata", async ({ page, request }) => {
    test.setTimeout(180_000);
    const fixtures = await loadProviderRawOutputUiFixtures();
    expect(fixtures.map((fixture) => fixture.caseId)).toEqual([
      "provider-success",
      "provider-failure",
      "provider-empty",
      "provider-oversized",
    ]);

    for (const fixture of fixtures) {
      const workItemId = await createWorkItem(request, {
        title: fixture.title,
        requestedOutcome: `Verify ${fixture.caseId} renders metadata-only provider evidence.`,
        source: "operator-dashboard:improvement",
        riskLevel: "medium",
        metadata: {
          executionRecipeId: "dashboard-test-coverage",
          intakeTemplateId: "operator-test-coverage",
          providerRawOutputUiCase: fixture.caseId,
        },
      });
      seedProviderRawOutputUiFixtureEvent(workItemId, fixture);

      const exportResponse = await request.get(`${supervisorUrl}/work-items/${workItemId}/runtime-evidence-export`);
      expect(exportResponse.ok()).toBeTruthy();
      const exportJson = JSON.stringify(await exportResponse.json());
      for (const sentinel of fixture.rawSentinels) {
        expect(exportJson, `Runtime export API retained ${fixture.caseId} raw-output sentinel ${sentinel}`).not.toContain(sentinel);
      }

      await page.goto(`/work-items/${workItemId}#runtime-evidence-export`, { waitUntil: "domcontentloaded" });

      const exportPanel = page.locator("#runtime-evidence-export");
      await expect(exportPanel).toBeInViewport();
      await expect(exportPanel.getByRole("heading", { name: "Subscription launch evidence" })).toBeVisible();
      await expect(exportPanel.getByText(fixture.status, { exact: true })).toBeVisible();
      await expect(exportPanel.getByText(fixture.readinessStatus, { exact: true })).toBeVisible();
      await expect(exportPanel.getByText(fixture.artifactKind, { exact: true })).toBeVisible();
      await expect(exportPanel.getByText(`blockedReason: ${fixture.blockedReason}`, { exact: true })).toBeVisible();
      await expect(exportPanel.getByText(`recoveryPath: ${fixture.recoveryPath}`, { exact: true })).toBeVisible();
      await expect(exportPanel.getByText(`nextSafeAction: ${fixture.nextSafeAction}`, { exact: true })).toBeVisible();
      await expect(exportPanel.getByText("Raw output stored")).toBeVisible();

      const bodyText = await page.locator("body").innerText();
      const bodyTextContent = await page.locator("body").evaluate((body) => body.textContent ?? "");
      const htmlContent = await page.content();
      for (const sentinel of fixture.rawSentinels) {
        expect(bodyText, `Runtime export DOM rendered ${fixture.caseId} raw-output sentinel ${sentinel}`).not.toContain(sentinel);
        expect(bodyTextContent, `Runtime export textContent retained ${fixture.caseId} raw-output sentinel ${sentinel}`).not.toContain(sentinel);
        expect(htmlContent, `Runtime export page HTML retained ${fixture.caseId} raw-output sentinel ${sentinel}`).not.toContain(sentinel);
      }
    }
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

    await page.getByRole("link", { name: "Delivery plans", exact: true }).click();
    const deliveryCleanupPlan = page.locator("#delivery-cleanup-plan");
    await expect(deliveryCleanupPlan.getByRole("heading", { name: "PR, merge, and cleanup dry-run plan" })).toBeVisible();
    await expect(deliveryCleanupPlan.getByText("PR readiness")).toBeVisible();
    await expect(deliveryCleanupPlan.getByText("Merge readiness")).toBeVisible();
    await expect(deliveryCleanupPlan.getByRole("heading", { name: "Cleanup readiness" })).toBeVisible();
    await expect(deliveryCleanupPlan.getByText("Blocked reasons").first()).toBeVisible();
    await expect(deliveryCleanupPlan.getByRole("heading", { name: "Retained evidence", exact: true })).toBeVisible();
    await expect(deliveryCleanupPlan.getByText("Dry-run effects").first()).toBeVisible();
    await expect(deliveryCleanupPlan.getByText("Cleanup target").first()).toBeVisible();
    await expect(deliveryCleanupPlan.getByText("Git worktree state").first()).toBeVisible();
    await expect(deliveryCleanupPlan.getByText("Filesystem state").first()).toBeVisible();
    await expect(deliveryCleanupPlan.getByText("Residue").first()).toBeVisible();
    await expect(deliveryCleanupPlan.getByText("requires exact approval")).toBeVisible();
    await expect(deliveryCleanupPlan.getByText("does not push, merge, delete worktrees, delete branches, sync issues, call providers, or bypass failed checks")).toBeVisible();
    await expect(deliveryCleanupPlan.getByRole("button")).toHaveCount(0);

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
    await expect(page.getByText("Isolated workspace plan")).toBeVisible();
    await expect(page.getByText("Create off")).toBeVisible();
    await expect(page.getByText("Cleanup off")).toBeVisible();
    await expect(page.getByText("local_worktree_creation_not_enabled")).toBeVisible();
    await expect(page.getByText("Plan only: no local filesystem mutation was performed.")).toBeVisible();
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
