# Story 6.27: Epic 6 MVP Proof Trial Packet

Date: 2026-06-11
Status: implemented locally; verified

## User Story

As Bob,
I want the Dev Console to show the exact MVP proof trial packet,
so that the next real BMAD story approval can be scoped without granting broad Codex, Claude, GitHub, cleanup, or autonomy authority.

## Context

Epic 6 is not complete until one real BMAD story reaches Dev Console done/evidence state through approved implementation, verification, delivery, and cleanup. Prior stories prepared read-only readiness, approval, delivery, cleanup, autonomy, and completion-audit surfaces. This story adds a read-only trial packet that names the next approval sequence and keeps every high-blast-radius operation blocked by default.

## Acceptance Criteria

1. Supervisor exposes `GET /supervisor/epic-6-mvp-proof-trial-report`.
2. The report names the selected-story step, bounded Codex implementation step, local/Ollama check boundary, bounded Claude review step, GitHub delivery step, and done-evidence step.
3. The report includes approval packets, blocked operations, stop conditions, and next safe actions.
4. The report states that Codex launch, Claude launch, provider expansion, and autonomous delivery are not approved.
5. The report appears in the report catalog, runtime evidence references, report shortcuts, and Controls page.
6. Tests prove the report is read-only and does not mutate workflow events.

## Implementation Notes

- Added `MvpProofTrialReportView` and `MvpProofTrialStepView`.
- Added `SupervisorService.get_epic_6_mvp_proof_trial_report()`.
- Added `GET /supervisor/epic-6-mvp-proof-trial-report`.
- Added `MvpProofTrialReportPanel` to Controls.
- Updated report catalog/runtime drift checks and story index references.

## Verification

Passed checks:

- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "mvp_proof_trial_report or supervisor_report_catalog or runtime_evidence_export"`
- `pnpm.cmd run check:reports`
- `pnpm.cmd run check:runtime-export`
- `pnpm.cmd run check:docs`
- `pnpm.cmd --filter @kendall/dashboard build`
- `$env:PLAYWRIGHT_BROWSERS_PATH='C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright'; pnpm.cmd run test:e2e:dashboard:controls`
- `pnpm.cmd run check`

## Authority Boundary

This story is read-only approval-packet preparation only. It does not approve or perform Codex launch, Claude launch, provider/model expansion, push, PR creation/update, CI wait, review comment mutation, merge, branch deletion, local cleanup, remote cleanup, issue/story sync, source mutation, credential/session access, or autonomous delivery.
