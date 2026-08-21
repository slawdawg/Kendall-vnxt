export const WORKSPACE_TEST_PROFILE_NAMES = Object.freeze([
  "discovery-readonly",
  "start-resume",
  "assignment-lease",
  "delivery-review",
  "cleanup-recovery",
  "shared-core",
]);

const PROFILE_RULES = Object.freeze([
  ["cleanup-recovery", /cleanup|recover|recovery|stale|prunable|\bremove\b|\bdelete\b|retire/i],
  ["delivery-review", /finish-pr|deliver|review|pull request|\bpush\b|\bcommit\b/i],
  ["assignment-lease", /assign|lease|claim|heartbeat|takeover|owner|lock/i],
  ["start-resume", /\bstart\b|\bresume\b|branch foundation/i],
  ["discovery-readonly", /doctor|\blist\b|inspect|report|read-only|summary|status|preview|help/i],
]);

export function isWorkspaceTestProfile(profile) {
  return profile === "all" || WORKSPACE_TEST_PROFILE_NAMES.includes(profile);
}

export function workspaceTestProfileForName(name) {
  const normalizedName = String(name || "");
  return PROFILE_RULES.find(([, pattern]) => pattern.test(normalizedName))?.[0] || "shared-core";
}
