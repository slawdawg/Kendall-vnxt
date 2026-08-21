import { digest } from "./contracts.mjs";

export function createShadowComparison({ sourceIdentity, plan, acceleratedStatus, governedStatus, governedDurationMs, now = new Date().toISOString() } = {}) {
  if (!sourceIdentity || !plan?.planId || !["passed", "failed", "cancelled", "unknown", "superseded"].includes(acceleratedStatus) || !["passed", "failed", "cancelled", "unknown", "superseded"].includes(governedStatus) || !Number.isInteger(governedDurationMs) || governedDurationMs < 0) throw new Error("Invalid shadow comparison.");
  const outcome = acceleratedStatus === governedStatus && acceleratedStatus === "passed" ? "matched" : "mismatch";
  const contents = { sourceIdentity, planId: plan.planId, selectedNodeIds: plan.nodes.map((node) => node.nodeId), reusedNodeIds: [], acceleratedStatus, governedStatus, governedDurationMs, outcome, fallback: "pnpm run check", createdAt: now };
  return { comparisonId: `shadow_${digest(contents).slice("sha256:".length)}`, ...contents };
}

export function promotionStatus({ comparisons = [], policy = null } = {}) {
  if (!policy?.approved || !Number.isInteger(policy.minimumMatches) || policy.minimumMatches < 1) return { status: "unavailable", reason: "promotion-policy-not-configured", fallback: "pnpm run check" };
  const matches = comparisons.filter((comparison) => comparison.outcome === "matched");
  if (comparisons.some((comparison) => comparison.outcome !== "matched")) return { status: "unavailable", reason: "shadow-mismatch", fallback: "pnpm run check" };
  if (matches.length < policy.minimumMatches) return { status: "unavailable", reason: "insufficient-same-head-evidence", fallback: "pnpm run check" };
  return { status: "eligible-for-policy-review", reason: "criteria-met-pending-review", fallback: "pnpm run check" };
}
