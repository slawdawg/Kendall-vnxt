# Supervisor Report Surface Classification (2026-08-15)

## Decision

The supervisor's read-only report surface has grown into a dashboard of
repository-maintenance and historical-program diagnostics. The supervisor must
retain only runtime-operational state and safety boundaries needed to operate
work items. Repository, CI, documentation, provider-review, and historical
program diagnostics belong in a CLI/doctor profile or concise durable record,
not in a product runtime API merely because they are useful to maintainers.

This is a **classification and migration-plan record**, not an endpoint
removal. No route, dashboard panel, contract, or test changes in this slice.
Each migration needs a consumer inventory, a replacement command or document,
same-head output-equivalence evidence where consumers exist, and a rollback
that restores the route and panel before deletion.

## Evidence and method

The route inventory is from
`services/supervisor/src/supervisor/api/main.py`. Current dashboard consumers
are in `apps/dashboard/src/components/controls-page-content.tsx`,
`apps/dashboard/src/lib/supervisor.ts`,
`apps/dashboard/src/lib/report-shortcuts.ts`, and
`apps/dashboard/src/lib/dashboard-page-read-manifest.json`; broad UI coupling
is also asserted by `tests/e2e/dashboard.spec.ts`. The service report catalog
and cross-links in `services/supervisor/src/supervisor/application/service.py`
are internal consumers, not proof that a report is product-runtime state.

Classification uses the program rule: a report is retained only when its
absence would prevent the current operator from safely reading or acting on a
work item. Git checkout health, CI workflow policy, local tooling readiness,
historical epic evidence, and prospective execution approval are developer or
governance evidence, even when currently rendered in Controls.

## Route disposition inventory

| Route family | Current route(s) | Disposition | First safe slice and successor |
| --- | --- | --- | --- |
| Runtime status and safety boundary | `/supervisor/status`, `/supervisor/execution-configuration-checks`, `/supervisor/execution-readiness-report`, `/supervisor/execution-state-boundary`, `/supervisor/threat-boundary` | retain runtime-operational signal | Consolidate into one bounded operational-status projection only after consumers prove field-level equivalence. |
| Work-item safety and evidence | `/supervisor/runtime-evidence-review-report`, `/supervisor/trusted-delivery-eligibility-report`, `/supervisor/low-risk-delivery-plan` | retain runtime-operational signal | Keep work-item-specific forms canonical; replace global navigation duplicates with a work-item detail link after parity proof. |
| Product migration visibility | `/supervisor/legacy-planning-artifact-inventory` | durable decision rewritten into a concise document | Preserve the inventory's current artifact facts in a dated migration record, then remove the dashboard-only route after no runtime caller remains. |
| Documentation and verification drift | `/supervisor/documentation-authority-report`, `/supervisor/verification-readiness-report`, `/supervisor/authority-readiness-matrix-report`, `/supervisor/dashboard-e2e-report` | developer diagnostic moved to CLI/doctor profile | Create a single `pnpm`/doctor report with machine-readable output and link the source-of-truth documents; delete API/panel only after CI and dashboard references move. |
| Repository and CI maintenance | `/supervisor/github-workflow-policy-report`, `/supervisor/git-hygiene-report`, `/supervisor/local-cleanup-readiness-report`, `/supervisor/remote-cleanup-sync-readiness-report` | developer diagnostic moved to CLI/doctor profile | Reuse or extend existing repository scripts; preserve no credential or remote mutation authority in the replacement. |
| Workflow-planning convenience | `/supervisor/report-catalog`, `/supervisor/maintenance-readiness-report`, `/supervisor/maintenance-action-plan-report`, `/supervisor/safe-development-backlog`, `/supervisor/development-runway-report`, `/supervisor/runner-assignment-status-report` | developer diagnostic moved to CLI/doctor profile | Replace the catalog with a documented CLI index and derive planning from Git-backed work packets rather than runtime-generated backlog prose. |
| Tool/provider/review readiness | `/supervisor/managed-recipe-policy-report`, `/supervisor/codex-readiness-report`, `/supervisor/codex-implementation-approval-report`, `/supervisor/claude-review-readiness-report`, `/supervisor/claude-review-approval-report`, `/supervisor/review-resource-policy-report`, `/supervisor/github-delivery-authority-report` | durable decision rewritten into a concise document | Keep policy and approval provenance in versioned docs and the governed delivery ledger; a replacement must remain fail-closed and never convert diagnostic readback into execution authority. |
| Historical Epic 6 proof | `/supervisor/epic-6-completion-audit-report`, `/supervisor/epic-6-mvp-proof-trial-report`, `/supervisor/delivery-readiness-policy-report`, `/supervisor/trusted-autonomy-readiness-report` | historical/epic-specific surface removed | Archive the exact final evidence and add a concise historical index; remove panels, schemas, service generators, routes, fixtures, and e2e assertions together in one compatibility-recorded slice. |

## Required migration order

1. Establish a machine-readable report-consumer inventory (route, dashboard
   panel, schema, service generator, tests, CLI/script, and documentation
   reference). Treat every current reference as a removal blocker.
2. Extract the developer-diagnostic groups into a single read-only CLI/doctor
   profile. It must accept an explicit repository path, return stable JSON plus
   human text, and run no provider, command-execution, credential, or remote
   mutation operation.
3. Move durable policy/approval facts to versioned documents and a concise
   navigation index. Historical documents remain provenance; they are not
   silently overwritten to look current.
4. Migrate dashboard Controls to the retained operational projection and
   work-item detail evidence. Verify an authenticated/dashboard consumer cannot
   observe a removed route.
5. Remove one family at a time: contract schema, service generator, route,
   client fetcher, panel, shortcuts, fixtures, e2e assertions, and report
   catalog entry. Require clean-install plus focused API/dashboard/CLI proof.

## Non-negotiables

- No classification authorizes execution, provider/model calls, process launch,
  source mutation, network access, credential access, or a change to current
  approval state.
- Do not delete a route because it is redundant in prose. Prove field-level
  replacement or a confirmed zero-consumer inventory first.
- Preserve work-item lifecycle, evidence export, delivery eligibility, and
  threat/authority boundary reads until their successor projection is in use.
- Keep the current dashboard fixture-only `/pipeline/demo` contract outside
  this inventory; it has separate retention authority.

## Exit evidence for the first removal PR

The first removal PR must include the frozen consumer inventory, replacement
CLI/doctor output for the same checkout, dashboard/API contract results,
documentation link validation, exact-head CI evidence, explicit removed paths,
and a bounded revert of that PR's merge commit. A failure to prove a consumer
replacement keeps the route in its current state.
