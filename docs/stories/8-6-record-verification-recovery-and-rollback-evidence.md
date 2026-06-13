---
baseline_commit: 84465778a690822cbefc63dd4c5d6a81bfab9fb8
---

# Story 8.6: Record Verification, Recovery, And Rollback Evidence

Date: 2026-06-12
Status: done

## Story

As Bob,
I want the first subscription-agent launch result verified and retained with recovery and rollback evidence,
so that failed or interrupted launches can be inspected, retried, disabled, or rolled back safely.

## Acceptance Criteria

1. Given a subscription-agent launch has terminal evidence, when Kendall evaluates verification readiness, then the approved verification command, terminal event, artifact references, rollback policy, and next safe action are visible without raw stdout, raw stderr, generated patch content, prompts, completions, provider payloads, secrets, or source snapshots.
2. Given the approved verification command is recorded for a subscription-agent launch attempt, when Kendall stores verification evidence, then the evidence is attached to the existing `ExecutionAttempt`, records pass/fail/timeout/could-not-run status, records recovery action, records rollback status, and blocks further delivery eligibility on failed, stale, missing, timed-out, or could-not-run verification.
3. Given subscription-agent verification fails or is interrupted, when Bob views Dev Console work-item detail and runtime evidence export, then the UI shows the retained artifact references, failure class, recovery path, rollback-disabled or rollback-triggered state, and smallest next safe action without adding a broad launch, retry, cleanup, GitHub, provider, credential, network, or source-mutation control.
4. Given rollback is triggered for a subscription-agent launch attempt, when Kendall records rollback evidence, then future subscription-agent launch attempts for the affected work item are disabled or blocked with a stable rollback reason, dashboard readiness shows disabled rollback state, and prior verification/launch evidence remains inspectable.
5. Given Story 8.6 completes, then source mutation, issue sync, PR creation/update, merge, cleanup, failed-check bypass, provider/model calls, Claude launch, credential/session access, network expansion, and broad autonomy remain blocked unless separately approved by a later exact authority packet.

## Tasks / Subtasks

- [x] Add subscription-launch verification/recovery evidence contract. (AC: 1, 2, 5)
  - [x] Extend supervisor schema/contracts only as needed to represent subscription launch verification status, recovery path, rollback status, failure class, next safe action, and related artifact references.
  - [x] Reuse the existing `ExecutionAttempt` and artifact reference model; do not introduce a parallel subscription-launch attempt model.
  - [x] Ensure evidence references the accepted Story 8.5 launch attempt id and route decision id so stale or unrelated attempts cannot make current readiness green.
- [x] Persist verification result and recovery metadata for subscription launch attempts. (AC: 2, 4, 5)
  - [x] Reuse or adapt `record_execution_attempt_verification_evidence` and `execution_attempt.verification_recorded` patterns where practical.
  - [x] Record pass, fail, timed-out, could-not-run, missing, and stale verification states with stable blocked reason ids.
  - [x] Record `recoveryPath`, `rollbackStatus`, `rollbackReason`, `nextSafeAction`, and artifact references as metadata only.
  - [x] Do not run arbitrary verification commands; only execute the approved verification command already bound in the exact launch envelope or use a safe fake adapter in tests.
- [x] Add rollback-disabled and rollback-triggered evidence behavior. (AC: 3, 4, 5)
  - [x] Preserve Story 8.5 rollback-disabled metadata event behavior.
  - [x] Add a rollback evidence path that can mark future launch attempts blocked for the work item with a stable rollback reason.
  - [x] Make rollback evidence idempotent: repeated records for the same attempt should not duplicate or corrupt evidence.
  - [x] Keep rollback metadata-only; do not delete files, clean worktrees, kill processes, mutate source, push branches, open PRs, or touch credentials.
- [x] Extend runtime export and Dev Console evidence. (AC: 1, 3, 4)
  - [x] Extend `RuntimeEvidenceSubscriptionLaunchView` or an adjacent focused view so runtime export includes verification result, recovery path, rollback status, artifact references, safety flags, and related reports.
  - [x] Update `SubscriptionLaunchReadinessPanel` and/or `RuntimeEvidenceExportPanel` to show verification/recovery/rollback evidence without implying broad controls.
  - [x] Ensure latest-event selection cannot let a later readiness-only event hide a failed verification, rollback-triggered, or completed terminal state.
- [x] Add focused backend, dashboard, and drift tests. (AC: 1-5)
  - [x] Add supervisor tests for passed verification, failed verification blocking delivery eligibility, timed-out/could-not-run states, missing/stale verification evidence, rollback-triggered blocking, raw-output exclusion, and idempotent rollback evidence.
  - [x] Add dashboard E2E coverage showing verification/recovery/rollback evidence on a subscription launch work item without raw output or broad launch controls.
  - [x] Update static drift checks so subscription launch verification, recovery, and rollback evidence cannot be silently dropped from runtime export or dashboard rendering.
- [x] Update story evidence after implementation. (AC: 1-5)
  - [x] Record every verification command and result in this story file.
  - [x] Update File List and Completion Notes with every changed file.
  - [x] If any real verification or rollback operation would cross a new authority boundary, stop and request an exact approval packet first.

## Dev Notes

### Authority Posture

Story 8.6 is an evidence and readiness story. It does not approve a second subscription-agent launch, broad retry automation, cleanup, source mutation, provider calls, credential/session access, network expansion, GitHub delivery, or real rollback side effects.

Allowed implementation posture:

- metadata-only verification/recovery/rollback evidence;
- safe local verification command only when it is the exact command bound in the Story 8.5 approved artifact-only fixture envelope or a deterministic fake adapter in tests;
- dashboard/runtime export rendering;
- stable blocked reasons and next-safe-action text.

Stop and ask Bob before:

- launching any real subscription-agent process beyond the Story 8.5 artifact-only fixture path;
- adding a dashboard retry/rollback button that triggers behavior instead of recording evidence;
- deleting files, cleaning worktrees, killing processes, pushing branches, opening PRs, merging, or syncing issues;
- reading credential/session paths or expanding network/provider access.

### Source Requirements From Epic 8

- Epic 8 objective: convert the deferred subscription-agent launch stop-line into a staged approval-bound launch path that starts below the real-process boundary and proves exactly bounded behavior.
- Cross-story invariant: no story may grant broad autonomy, secret access, provider expansion, issue sync, source mutation, failed-check bypass, Claude launch, or subscription-agent process launch beyond the exact approval envelope named for that story.
- Story 8.6 requires verification result, recovery path, rollback status, artifact references, and next safe action to be retained after terminal subscription-launch evidence.
- Failed verification must block further delivery eligibility.
- Rollback-triggered state must disable future launch attempts and remain inspectable without raw secrets or unbounded output.

### Previous Story Intelligence

- Story 8.5 is `Status: done` and established the accepted artifact-only fixture path.
- Story 8.5 binds acceptance to Bob's literal recorded approval timestamp/expiry:
  - accepted timestamp: `2026-06-12T16:20:33.2776334-05:00`
  - expiry: `2026-06-12T16:50:33.2776334-05:00`
- Story 8.5 keeps `processLaunchAllowed`, `executionAllowed`, and `processLaunchAttempted` true only for the approved artifact-only fixture-start path. Those fields do not grant shell execution, provider calls, network access, credentials, or source mutation.
- Story 8.5 completion-pass review fixed:
  - `commandExecutionAllowed` remains false on accepted fixture evidence;
  - rejection evidence is always persisted;
  - missing approval fields remain visibly missing;
  - accepted attempts bind to the retained route decision id;
  - runtime export/dashboard latest-event ordering prioritizes completed fixture evidence;
  - timeout, cancellation, and rollback-disabled metadata events are persisted.
- Story 8.5 runtime export now includes `RuntimeEvidenceSubscriptionLaunchView` with approval binding, lifecycle summary, workspace summary, artifact references, safety flags, cancellation/timeout/rollback evidence, and related reports.
- Existing focused test command from Story 8.5:
  - `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch or runtime_evidence_export_includes_subscription_launch_summary"`

### Existing Implementation To Reuse

- Supervisor routes and schemas:
  - `services/supervisor/src/supervisor/api/main.py`
  - `services/supervisor/src/supervisor/api/schemas.py`
  - `packages/contracts/src/api.ts`
- Supervisor service:
  - `services/supervisor/src/supervisor/application/service.py`
  - `evaluate_subscription_agent_launch_request`
  - `_record_subscription_agent_launch_fixture_attempt`
  - `_record_subscription_agent_launch_fixture_event`
  - `_runtime_evidence_subscription_launch_summary`
  - `record_execution_attempt_verification_evidence`
  - `_run_execution_attempt_verification_command`
  - `_record_verification_evidence_event`
- Domain:
  - `services/supervisor/src/supervisor/domain/subscription_launch.py`
  - `DisabledSubscriptionLaunchAdapter.lifecycle_evidence`
  - `DisabledSubscriptionLaunchAdapter.output_contract`
  - `SUBSCRIPTION_LAUNCH_FORBIDDEN_PATHS`
- Dashboard:
  - `apps/dashboard/src/components/subscription-launch-readiness-panel.tsx`
  - `apps/dashboard/src/components/runtime-evidence-export-panel.tsx`
  - `apps/dashboard/src/app/work-items/[work-item-id]/page.tsx`
- Tests and drift checks:
  - `services/supervisor/tests/integration/test_routing_preview.py`
  - `tests/e2e/dashboard.spec.ts`
  - `scripts/check-runtime-evidence-export.mjs`
  - `scripts/preflight.mjs` now blocks `next/font/google` so dashboard builds are sandbox-safe.

### Architecture Guardrails

- `docs/prds/subscription-agent-launch-disabled-to-supervised-execution.md`
  - Launch evidence attaches to `ExecutionAttempt`, not `QueueLease`.
  - Workflow events must not embed raw process output.
  - Runtime exports should include approval binding, process lifecycle summary, workspace summary, output artifact references, safety flags, cancellation/timeout/rollback evidence, and related reports.
  - Rollback must include a global disable/blocked state, dashboard disabled reason, interrupted-launch artifact retention, rejection of new launch requests, and retained summaries without raw secret/session data.
- `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md`
  - Recovery must define inspect, retry without stale approval, rollback/global-disable, orphan cleanup, partial output archival, and safe workspace revert behavior.
  - This story should only implement metadata evidence for those behaviors unless separately approved.
- `docs/architecture/kendall-vnxt-dashboard-command-boundary-2026-06-08.md`
  - Dashboard may display execution-prohibited evidence and approval-bound state, but must not become an independent execution authority.
  - Do not add dashboard controls that launch processes, call providers, run arbitrary shell commands, mutate source, grant network access, or read credentials.
- `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`
  - Credential access, provider/model calls, arbitrary commands, broad worker network access, source mutation, and background runtime assistant behavior remain denied unless separately approved.

### Implementation Guidance

- Start with failing supervisor tests for subscription-launch verification evidence and rollback blocking behavior.
- Prefer adding a subscription-specific evidence helper that composes existing verification evidence rather than duplicating the full verification runner.
- Keep all retained output as artifact references and bounded summaries. Do not place raw stdout, stderr, generated patch text, prompts, completions, provider payloads, secrets, or source snapshots in workflow events.
- Treat rollback-triggered as a blocking evidence state, not as a destructive cleanup operation.
- Keep latest-event selection priority explicit. Completed launch, failed verification, and rollback-triggered evidence should not be hidden by later readiness-only events.
- Preserve Story 8.5 behavior unless the tests in this story intentionally extend it.

### Testing

- Focused supervisor tests:
  - `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch"`
  - Add a narrower `-k` filter for new verification/recovery/rollback test names during red/green work.
- Static drift checks:
  - `pnpm.cmd run check:runtime-export`
  - `pnpm.cmd run check:process-lifecycle`
  - `pnpm.cmd run check:execution-boundary`
- Dashboard build:
  - `pnpm.cmd --filter @kendall/dashboard build`
- Dashboard E2E:
  - Use the existing focused dashboard E2E runner pattern from Story 8.5 and add a Story 8.6-specific grep.
- Full check:
  - `pnpm.cmd run check`
  - This now passes inside the sandbox after the Google Fonts fetch fix; do not reintroduce build-time Google font fetching.

### References

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-12.md`
- `docs/stories/8-5-execute-one-explicitly-approved-artifact-only-subscription-agent-launch.md`
- `docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md`
- `docs/goals/epic-8-first-subscription-launch-policy-2026-06-12.md`
- `docs/prds/subscription-agent-launch-disabled-to-supervised-execution.md`
- `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md`
- `docs/architecture/kendall-vnxt-dashboard-command-boundary-2026-06-08.md`
- `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/domain/subscription_launch.py`
- `packages/contracts/src/api.ts`
- `apps/dashboard/src/components/subscription-launch-readiness-panel.tsx`
- `apps/dashboard/src/components/runtime-evidence-export-panel.tsx`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `tests/e2e/dashboard.spec.ts`
- `scripts/check-runtime-evidence-export.mjs`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch_verification_records_recovery"` initially red: approved verification command was not yet bound to the Story 8.5 artifact-only fixture envelope, returning 409 for command mismatch.
- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch_verification_records_recovery"` passed after binding the exact approved command and recording subscription launch verification metadata.
- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch"` passed: 11 passed, 96 deselected, 1 warning.
- `pnpm.cmd run check:runtime-export` passed.
- `pnpm.cmd --filter @kendall/dashboard build` passed.
- `node -e "import('./scripts/dashboard-e2e-runner.mjs').then(m=>m.runFocusedDashboardE2E({databaseName:'e2e-subscription-launch-verification-rollback',grep:'shows subscription launch verification recovery and rollback evidence without controls'})).then(code=>process.exit(code))"` passed: 1 passed.
- `pnpm.cmd run check` passed: dashboard build and 162 supervisor integration tests passed with 1 warning.
- Code review patch pass: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch"` passed: 12 passed, 96 deselected, 1 warning.
- Code review patch pass: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "verification_evidence_records_result"` passed: 1 passed, 107 deselected.
- Code review patch pass: `pnpm.cmd run check:runtime-export` passed.
- Code review patch pass: `pnpm.cmd --filter @kendall/dashboard build` passed.
- Code review patch pass: `node -e "import('./scripts/dashboard-e2e-runner.mjs').then(m=>m.runFocusedDashboardE2E({databaseName:'e2e-subscription-launch-verification-rollback',grep:'shows subscription launch verification recovery and rollback evidence without controls'})).then(code=>process.exit(code))"` passed: 1 passed.
- Code review patch pass: `pnpm.cmd run check` passed: dashboard build and 163 supervisor integration tests passed with 1 warning.

### Review Findings

- [x] [Review][Patch] Runtime export drops retained launch lifecycle and fixture artifact evidence after verification [services/supervisor/src/supervisor/application/service.py:5668]
- [x] [Review][Patch] Runtime export can treat generic verification events with empty subscriptionLaunchVerification as subscription launch evidence [services/supervisor/src/supervisor/application/service.py:5698]
- [x] [Review][Patch] Stale subscription-launch verification evidence is not representable with a stable blocked reason [services/supervisor/src/supervisor/application/service.py:6305]
- [x] [Review][Patch] Rollback evidence idempotence only blocks duplicate commandId, not repeated rollback evidence for the same attempt [services/supervisor/src/supervisor/application/service.py:6310]
- [x] [Review][Patch] Disabled-launch stub approval binding verification command differs from accepted launch command binding [services/supervisor/src/supervisor/domain/subscription_launch.py:235]
- [x] [Review][Patch] Rejection evidence sanitizer can retain raw or secret-like data under innocuous nested values [services/supervisor/src/supervisor/application/service.py:7941]
- [x] [Review][Defer] Subscription launch request recordEvent default is ignored by the Story 8.5 launch endpoint [services/supervisor/src/supervisor/application/service.py:7630] — deferred, prior-scope launch endpoint semantics
- [x] [Review][Defer] Existing provider raw-output UI regression coverage was weakened while adding subscription-launch dashboard coverage [tests/e2e/dashboard.spec.ts:1006] — deferred, broader runtime export dashboard coverage

### Completion Notes List

- Added subscription-launch verification evidence to the existing `ExecutionAttempt` verification path, including recovery path, rollback status/reason, blocked reason, delivery eligibility, next safe action, exact approved command binding, and artifact-reference-only output summary.
- Runtime evidence export now reports missing verification as `not_recorded` for completed subscription fixture evidence and reports failed/rollback-triggered verification without raw stdout, raw stderr, prompts, completions, provider payloads, secrets, or source snapshots.
- Rollback-triggered verification evidence blocks later subscription-agent launch acceptance for the affected work item with stable rollback readiness and blocked reason metadata.
- Dev Console subscription launch readiness and runtime evidence export panels now render verification/recovery/rollback evidence without adding launch, retry, cleanup, GitHub, provider, credential, network, or source-mutation controls.
- Added supervisor, static drift, and focused dashboard E2E coverage for the verification/recovery/rollback evidence path.
- Code review fixes keep launch lifecycle/fixture artifact evidence visible after verification, exclude generic verification events from subscription launch export, add stale verification evidence semantics, enforce rollback idempotency across command ids, align stub and accepted verification command bindings, and harden artifact-limit sanitization.

### File List

- `apps/dashboard/src/components/runtime-evidence-export-panel.tsx`
- `apps/dashboard/src/components/subscription-launch-readiness-panel.tsx`
- `docs/stories/8-6-record-verification-recovery-and-rollback-evidence.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/contracts/src/api.ts`
- `scripts/check-runtime-evidence-export.mjs`
- `scripts/dashboard-e2e-runner.mjs`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `tests/e2e/dashboard.spec.ts`

### Change Log

- 2026-06-12: Implemented Story 8.6 subscription-launch verification, recovery, rollback evidence, dashboard/runtime export rendering, focused tests, and drift checks.
