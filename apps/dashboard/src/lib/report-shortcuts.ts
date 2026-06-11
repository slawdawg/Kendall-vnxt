export const reportAnchorByEndpoint: Record<string, string> = {
  "GET /supervisor/execution-configuration-checks": "#execution-readiness-report",
  "GET /supervisor/threat-boundary": "#execution-readiness-report",
  "GET /supervisor/execution-readiness-report": "#execution-readiness-report",
  "GET /supervisor/documentation-authority-report": "#documentation-authority-report",
  "GET /supervisor/verification-readiness-report": "#verification-readiness-report",
  "GET /supervisor/authority-readiness-matrix-report": "#authority-readiness-matrix-report",
  "GET /supervisor/dashboard-e2e-report": "#dashboard-e2e-report",
  "GET /supervisor/report-catalog": "#supervisor-report-catalog",
  "GET /supervisor/maintenance-readiness-report": "#maintenance-readiness-report",
  "GET /supervisor/maintenance-action-plan-report": "#maintenance-action-plan-report",
  "GET /supervisor/development-runway-report": "#development-runway-report",
  "GET /supervisor/runtime-evidence-review-report": "#runtime-evidence-review-report",
  "GET /supervisor/safe-development-backlog": "#safe-development-backlog",
  "GET /supervisor/managed-recipe-policy-report": "#managed-recipe-policy-report",
  "GET /supervisor/github-workflow-policy-report": "#github-workflow-policy-report",
  "GET /supervisor/git-hygiene-report": "#git-hygiene-report",
  "GET /supervisor/codex-readiness-report": "#codex-readiness-report",
  "GET /supervisor/delivery-readiness-policy-report": "#delivery-readiness-policy-report",
  "GET /supervisor/execution-state-boundary": "#execution-readiness-report",
  "GET /supervisor/disabled-provider-proofs": "#execution-readiness-report",
};

export function reportShortcutHref(endpoint: string): string {
  return `/controls${reportAnchorByEndpoint[endpoint] ?? "#supervisor-report-catalog"}`;
}
