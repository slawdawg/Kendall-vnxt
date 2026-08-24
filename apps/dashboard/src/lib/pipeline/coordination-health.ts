import type { PipelineCoordinationHealthV0 } from "@kendall/contracts";
import type { DashboardCanonicalCoordinationHealthV1 } from "./canonical-operational-projection";

const unsafeEvidenceRefPattern =
  /\b(raw[\s_-]*(prompts?|completions?|transcripts?)|reasoning[\s_-]*traces?|provider[\s_-]*payloads?|secrets?([\s_-]*(key|token|value|id))?|credentials?([\s_-]*(key|token|value|id))?|(terminal|tmux|pane)[\s_-]*(scrollbacks?|texts?|outputs?|stdouts?|stderrs?))\b/i;
const tokenLikeMetadataValuePattern =
  /(?<![A-Za-z0-9])(?:sk-(?:proj-)?[A-Za-z0-9][A-Za-z0-9_-]{7,}|gh[pousr]_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{8,}|AIza[A-Za-z0-9_-]{8,}|AKIA[A-Z0-9]{8,}|ASIA[A-Z0-9]{8,}|glpat-[A-Za-z0-9_-]{8,}|npm_[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{20,}|eyJ[A-Za-z0-9_-]{20,})(?![A-Za-z0-9_-])/i;
const executableControlTextPattern =
  /\b(tmux\s+(kill|send|capture|new|attach)|git(hub)?\s+(push|merge|checkout|reset|clean|branch|pr)|gh\s+(pr|repo|api)|curl\s+|bash\s+|sh\s+|python\s+|node\s+|pnpm\s+|uv\s+run|provider\s+(call|request|payload))\b/i;

const canonicalCoordinationHealthKeys = new Set([
  "observedAt", "source", "freshness", "availability", "activeWorkCount", "staleOwnerTargetCount",
  "staleOwnerProjectedCount", "dirtyPreserveCount", "missingWorktreeJournalHold", "nextSafeAction", "metadataOnly",
]);

function isSafeEvidenceRef(value: unknown): value is string {
  return isSafeReferenceString(value) && value.length <= 255 && !unsafeEvidenceRefPattern.test(value) && !tokenLikeMetadataValuePattern.test(value);
}

function isSafeReferenceString(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  const normalized = value.trim().toLowerCase();
  return !normalized.startsWith("fixture:") && !normalized.startsWith("demo:");
}

function isSafeProjectionText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 500
    && !unsafeEvidenceRefPattern.test(value) && !tokenLikeMetadataValuePattern.test(value)
    && !executableControlTextPattern.test(value);
}

function isTimestampString(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/** Validate the retained supervisor coordination-health receipt without loading the V0 projection validator. */
export function isPipelineCoordinationHealth(value: unknown): value is PipelineCoordinationHealthV0 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const health = value as PipelineCoordinationHealthV0;
  return health.schemaVersion === "manager-coordination-health/v0"
    && isSafeEvidenceRef(health.runId) && isTimestampString(health.observedAt)
    && health.source === "manager_workspace_inventory"
    && (health.freshness === "fresh" || health.freshness === "unavailable")
    && (health.availability === "available" || health.availability === "incomplete" || health.availability === "unavailable")
    && [health.activeWorkCount, health.staleOwnerTargetCount, health.staleOwnerProjectedCount, health.dirtyPreserveCount]
      .every((count) => Number.isSafeInteger(count) && count >= 0)
    && health.staleOwnerProjectedCount <= health.staleOwnerTargetCount
    && (health.staleOwnerProjectedCount === health.staleOwnerTargetCount || health.availability === "incomplete")
    && typeof health.missingWorktreeJournalHold === "boolean"
    && isSafeProjectionText(health.nextSafeAction)
    && Array.isArray(health.evidenceRefs) && health.evidenceRefs.length <= 8 && health.evidenceRefs.every(isSafeEvidenceRef)
    && health.metadataOnly === true && health.rawPayloadRetained === false;
}

/** Validate the compact client-safe coordination-health DTO independently from its V0 receipt. */
export function isDashboardCanonicalCoordinationHealth(value: unknown): value is DashboardCanonicalCoordinationHealthV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const health = value as Record<string, unknown>;
  if (!Object.keys(health).every((key) => canonicalCoordinationHealthKeys.has(key))) return false;
  const counts = [health.activeWorkCount, health.staleOwnerTargetCount, health.staleOwnerProjectedCount, health.dirtyPreserveCount];
  return isTimestampString(health.observedAt)
    && health.source === "manager_workspace_inventory"
    && (health.freshness === "fresh" || health.freshness === "unavailable")
    && (health.availability === "available" || health.availability === "incomplete" || health.availability === "unavailable")
    && counts.every((count) => typeof count === "number" && Number.isSafeInteger(count) && count >= 0)
    && (health.staleOwnerProjectedCount as number) <= (health.staleOwnerTargetCount as number)
    && ((health.staleOwnerProjectedCount as number) === (health.staleOwnerTargetCount as number) || health.availability === "incomplete")
    && typeof health.missingWorktreeJournalHold === "boolean"
    && isSafeProjectionText(health.nextSafeAction)
    && health.metadataOnly === true;
}

export function isDashboardCoordinationHealthInput(value: unknown): value is PipelineCoordinationHealthV0 | DashboardCanonicalCoordinationHealthV1 {
  return isPipelineCoordinationHealth(value) || isDashboardCanonicalCoordinationHealth(value);
}
