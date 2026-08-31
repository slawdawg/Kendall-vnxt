import { evaluateReviewGatedLowRiskAutomation } from "./review-gated-low-risk-automation.mjs";

export const FAKE_REVIEW_NOW = "2026-07-17T12:00:00.000Z";

export const FAKE_REVIEW_SCENARIOS = Object.freeze([
  "PASS",
  "CONCERNS",
  "BLOCKED",
  "STALE",
  "MISMATCH",
  "FORBIDDEN_METADATA",
  "MODEL_ROUTE",
  "HIGH_RISK",
  "STOP_LINE",
  "ROLLBACK",
]);

/**
 * Build deterministic synthetic review input for contract tests.
 * This adapter has no provider, network, filesystem, Git, or mutation path.
 */
export function buildFakeReviewInput(scenario = "PASS", now = FAKE_REVIEW_NOW) {
  if (!FAKE_REVIEW_SCENARIOS.includes(scenario)) {
    throw new Error("Unknown fake review scenario");
  }

  const binding = {
    baseSha: "fake-base-123",
    headSha: "fake-head-456",
    diffHash: "fake-diff-789",
    owner: "fake-owner",
    worktree: "/managed/fake-worktree",
  };
  const input = {
    operation: "documentation-maintenance",
    review: {
      ...binding,
      status: "PASS",
      reviewId: `fake-review-${scenario.toLowerCase()}`,
      packetId: `fake-packet-${scenario.toLowerCase()}`,
      model: "5.6 Luna",
      effort: "high",
      reviewedAt: now,
    },
    state: {
      ...binding,
      changedFiles: ["docs/workflows/example.md"],
      allowlistedFiles: ["docs/workflows/example.md"],
      disallowedFiles: [],
      exactHead: true,
      statusChecks: true,
      reviewThreads: true,
      rollback: true,
      rollbackPath: "revert:fake-commit-123",
      evidence: {
        exactHead: { headSha: binding.headSha, checkedAt: now, ref: "fake:head" },
        statusChecks: { headSha: binding.headSha, checkedAt: now, ref: "fake:checks" },
        reviewThreads: { headSha: binding.headSha, checkedAt: now, ref: "fake:threads" },
        rollback: { headSha: binding.headSha, checkedAt: now, ref: "fake:rollback" },
      },
      cleanupWithinNamedLane: true,
    },
    authority: {
      recorded: true,
      scopeAllowed: true,
      decision: "approved-for-report-only-evaluation",
      stopLines: [
        "no mutation, merge, or cleanup",
        "no provider or live-model calls",
        "no bypass or override",
      ],
      recoveryPath: "Preserve evidence and request explicit direction.",
      evidence: { headSha: binding.headSha, checkedAt: now, ref: "fake:authority" },
    },
  };

  switch (scenario) {
    case "CONCERNS":
      input.review.status = "CONCERNS";
      break;
    case "BLOCKED":
      input.review.status = "BLOCKED";
      break;
    case "STALE":
      input.review.reviewedAt = "2026-07-17T11:00:00.000Z";
      break;
    case "MISMATCH":
      input.review.headSha = "other-head";
      break;
    case "FORBIDDEN_METADATA":
      input.review.rawPrompt = "synthetic forbidden payload";
      break;
    case "MODEL_ROUTE":
      input.review.model = "gpt-5.3-codex-spark";
      break;
    case "HIGH_RISK":
      input.state.changedFiles = ["config/.env"];
      input.state.allowlistedFiles = ["config/.env"];
      break;
    case "STOP_LINE":
      input.authority.stopLines = ["mutation is allowed", "provider use is okay", "bypass is okay"];
      break;
    case "ROLLBACK":
      input.state.rollbackPath = "delete-all";
      break;
    default:
      break;
  }

  return input;
}

export function runFakeReviewScenario(scenario = "PASS", options = {}) {
  const now = options?.now ?? FAKE_REVIEW_NOW;
  return evaluateReviewGatedLowRiskAutomation(buildFakeReviewInput(scenario, now), { now });
}
