---
baseline_commit: 84465778a690822cbefc63dd4c5d6a81bfab9fb8
---

# Story 8.4: Show Subscription Launch Readiness In Dev Console

Date: 2026-06-12
Status: done

## Story

As Bob,
I want the Dev Console to show subscription-agent launch readiness, blocked states, and missing approvals,
so that I can see exactly why real launch is disabled or what exact approval is needed next.

## Acceptance Criteria

1. Given a work item has subscription-agent launch readiness evidence, when Bob opens the Dev Console work-item detail page, then the UI shows launch disabled, dry-run evidence available, approval missing, stale, running, terminal, and rollback states where applicable.
2. Given launch readiness is blocked, when Bob views the readiness panel, then the panel shows the smallest next safe action and the exact missing, rejected, or stale approval field using stable operator-readable labels.
3. Given Story 8.3 records metadata-only lifecycle and output artifact evidence, when Bob views the panel, then timeout, cancellation, heartbeat, child-process tracking, orphan detection, terminal-state reconciliation, idempotent cleanup, rollback, bounded output, and artifact-reference-only evidence are visible without raw stdout, stderr, generated patch content, prompts, completions, provider payloads, secrets, or source snapshots.
4. Given subscription-agent launch authority remains blocked, when Bob views the Dev Console, then the UI does not imply real process launch authority and does not present any control that can start a subscription-agent process, run shell commands, call providers, inherit credentials or sessions, mutate source, mutate issues, perform PR/merge/cleanup actions, or grant broad autonomy.
5. Given no subscription-agent launch evidence exists for a work item, when Bob opens the Dev Console, then the panel shows a clear not-started or missing-evidence state and does not present projected or theoretical launch readiness as operational truth.
6. Given dashboard state is refreshed after a launch-stub event is recorded, when Bob reopens the work-item detail view, then the readiness panel reflects the latest persisted supervisor evidence without requiring chat history reconstruction.

## Tasks / Subtasks

- [x] Add a read-only subscription launch readiness panel to the Dev Console work-item detail page. (AC: 1, 2, 4, 5, 6)
  - [x] Prefer a focused component such as `SubscriptionLaunchReadinessPanel` under `apps/dashboard/src/components/` instead of expanding unrelated panels into a mixed-purpose surface.
  - [x] Render the panel from persisted supervisor data already fetched by the work-item detail page: `WorkflowEventView[]`, `RuntimeEvidenceExportView`, and related `SubscriptionAgentLaunchStubView`/event payload evidence.
  - [x] Add an anchor/link near the existing sticky work-item detail navigation, using a readiness-only label such as `Launch readiness`, not `Launch`.
  - [x] Preserve existing work-item detail layout density and visual language from `GreenGateReadinessPanel`, `RuntimeEvidenceExportPanel`, and `ExecutionAttemptEvidencePanel`.
- [x] Surface exact blocked and next-action evidence from Story 8.3. (AC: 1, 2, 3, 5)
  - [x] Display readiness status such as `blocked_pending_exact_launch_approval`, disabled reason `subscription_agent_process_launch_not_enabled`, missing envelope fields, rejected envelope fields, stale envelope fields, launch policy id `epic-8-first-subscription-launch-policy-v1`, target id, command template id, and command template executable state.
  - [x] Show smallest next safe action derived from current evidence, for example: approve the exact launch envelope later, fill the missing approval actor/timestamp/expiry, inspect rejected permission envelope, or preserve disabled state.
  - [x] Treat blocked reason ids as set-like evidence; do not make UI behavior depend on list ordering.
  - [x] Show a no-evidence state when no `routing.subscription_agent_launch_stub_created` event or subscription launch evidence is present.
- [x] Surface metadata-only lifecycle, output, and rollback evidence without raw payloads. (AC: 1, 3, 4)
  - [x] Display lifecycle states and policy result summaries for planned, approved, starting, running, cancel requested, cancelled, timed out, failed, completed, rejected, timeout, cancellation, heartbeat, child-process tree tracking, orphan detection, terminal reconciliation, idempotent cleanup, and rollback where present.
  - [x] Display output artifact summary fields such as `artifactReferenceOnly`, `boundedByteCounts`, `workflowEventRawOutputAllowed`, `rawOutputStored`, `generatedPatchHandling`, and artifact reference metadata.
  - [x] Do not render raw stdout, raw stderr, generated patch content, secrets, provider/model payloads, or broad filesystem/source snapshots.
  - [x] If evidence says `workflowEventRawOutputAllowed` or `rawOutputStored` is false, copy must reinforce that raw output remains excluded.
- [x] Preserve the execution-prohibited dashboard boundary. (AC: 4)
  - [x] Do not add dashboard buttons, forms, actions, client fetches, server actions, or API calls that start or approve real subscription-agent launch.
  - [x] Do not add supervisor endpoints that launch processes, execute shell commands, call providers, mutate source, mutate issues, create/update PRs, merge, clean up, or access credentials/sessions.
  - [x] If a helper is added for E2E setup, keep it test-only and use the existing disabled stub endpoint with `recordEvent: true`; do not wire it as an operator launch control.
- [x] Add focused dashboard and contract tests. (AC: 1-6)
  - [x] Add or update Playwright coverage in `tests/e2e/dashboard.spec.ts` so a work item with a recorded subscription launch stub event shows the readiness panel, exact blockers, disabled launch posture, artifact-only evidence, and no raw payload text.
  - [x] Reuse the existing E2E setup style (`createWorkItem`, supervisor API request helpers, and work-item detail navigation). If needed, add a helper that posts to `/work-items/{work_item_id}/subscription-agent-launch-stub` with `taskKind: "architecture_review"`, `requestedAgent`, and `recordEvent: true`.
  - [x] Add or update TypeScript compile/build coverage through `pnpm.cmd --filter @kendall/dashboard build` or `pnpm.cmd run check`.
  - [x] Keep supervisor tests focused only if backend response shape changes; otherwise do not add backend launch behavior for this UI story.
- [x] Update story evidence after implementation. (AC: 1-6)
  - [x] Record verification commands and results in this story file.
  - [x] Update the File List and Completion Notes with all changed files.

### Review Findings

- [x] [Review][Patch] Latest persisted event can be shadowed by stale page events [apps/dashboard/src/components/subscription-launch-readiness-panel.tsx:105]
- [x] [Review][Patch] Missing or partial readiness payload is rendered as real blocked readiness [apps/dashboard/src/components/subscription-launch-readiness-panel.tsx:107]
- [x] [Review][Patch] Lifecycle state mapping and terminal states from launch evidence are not visible [services/supervisor/src/supervisor/application/service.py:7730]
- [x] [Review][Patch] Command template executable state is not displayed [apps/dashboard/src/components/subscription-launch-readiness-panel.tsx:173]
- [x] [Review][Patch] Attempt audit flags are labeled as authority allowances [apps/dashboard/src/components/subscription-launch-readiness-panel.tsx:228]
- [x] [Review][Patch] Drift check does not guard the new subscription readiness surface [scripts/check-runtime-evidence-export.mjs:22]

## Dev Notes

### Product Intent

Story 8.4 makes Epic 8 useful to Bob before any real launch: the Dev Console should answer, in one place, why subscription-agent launch is disabled, what dry-run evidence exists, what exact approval field is missing/rejected/stale, and what safe action comes next.

This story is not the real launch. It is a readiness-only, execution-prohibited display story.

### Prior Story Intelligence

- Story 8.1 created `docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md`.
  - Stories 8.1 through 8.4 do not authorize real subscription-agent process launch.
  - Dashboard display of blocked or missing approval state is allowed.
  - The missing dashboard launch state blocker was `missing_subscription_launch_readiness_panel`.
- Story 8.2 created `docs/goals/epic-8-first-subscription-launch-policy-2026-06-12.md`.
  - Current target status is `not-approved`.
  - Launch readiness is `blocked_pending_exact_launch_approval`.
  - Launch policy id is `epic-8-first-subscription-launch-policy-v1`.
  - Dashboard posture is `execution-prohibited-display`.
  - Real launch remains denied until a later exact approval names target, command template, environment allowlist, artifact limits, timeout/cancel policy, approval expiry, dashboard controls, rollback, verification command, and allowed output mode.
- Story 8.3 added disabled/dry-run evidence in:
  - `services/supervisor/src/supervisor/domain/subscription_launch.py`
  - `services/supervisor/src/supervisor/application/service.py`
  - `services/supervisor/src/supervisor/api/schemas.py`
  - `packages/contracts/src/api.ts`
  - `services/supervisor/tests/integration/test_routing_preview.py`
- Story 8.3 review fixes are especially important for 8.4:
  - `readinessEvidence` distinguishes `missingEnvelopeFields`, `rejectedEnvelopeFields`, and `staleEnvelopeFields`.
  - `approvalBinding` now includes values for stale-tracked fields rather than only field names.
  - Launch-stub workflow events include `readinessStatus`, `blockedReasonIds`, `missingEnvelopeFields`, `rejectedEnvelopeFields`, `staleEnvelopeFields`, `lifecyclePolicyResults`, and `outputArtifactSummary`.
  - `outputArtifactSummary.artifactReferences` contains metadata-only references for simulated output summary and generated patch artifacts.
  - `packages/contracts/src/api.ts` makes `SubscriptionAgentLaunchStubView.readinessEvidence` optional for compatibility; UI code must handle missing evidence safely.

### Existing Implementation To Reuse

- Work-item detail page:
  - `apps/dashboard/src/app/work-items/[work-item-id]/page.tsx`
  - Already fetches `getWorkItem`, `getWorkItemEvents`, `getRoutingPreview`, `getExecutionAttempts`, `getRuntimeEvidenceExport`, and related reports.
  - Existing sticky navigation contains anchors for `Routing`, `Attempts`, `Export`, and other panels.
- Existing panel patterns:
  - `apps/dashboard/src/components/green-gate-readiness-panel.tsx`
    - Good model for readiness rows, status chips, exact blocked reasons, and next action copy.
  - `apps/dashboard/src/components/runtime-evidence-export-panel.tsx`
    - Good model for artifact/reference display and explicit safety flags.
  - `apps/dashboard/src/components/execution-attempt-evidence-panel.tsx`
    - Good model for lifecycle/status evidence from attempts.
- Supervisor client:
  - `apps/dashboard/src/lib/supervisor.ts`
    - Existing GET helpers should be reused where possible.
    - Do not add a dashboard helper that launches a subscription-agent process.
- Contract types:
  - `packages/contracts/src/api.ts`
    - `WorkflowEventView.payload` is `Record<string, unknown>`; parse defensively.
    - `RuntimeEvidenceExportView.workflowEvents` provides persisted event evidence.
    - `SubscriptionAgentLaunchStubView.readinessEvidence?` is optional and must not be assumed present.
- E2E tests:
  - `tests/e2e/dashboard.spec.ts`
    - Existing test `shows execution attempt evidence and disabled workspace boundaries on work item detail` demonstrates work-item setup, navigation, panel assertions, and runtime export assertions.
    - Add a focused subscription launch readiness test near this detail-page coverage.
  - `scripts/run-detail-e2e.mjs`
    - Currently greps for `shows execution attempt evidence and disabled workspace boundaries`; update or add an adjacent runner only if needed for focused local verification.

### Data Shape From Story 8.3

The panel should consume the latest `routing.subscription_agent_launch_stub_created` event for the current work item. Expected metadata-only payload fields include:

- `targetId`
- `launchPolicyId`
- `commandTemplateId`
- `workspacePlanId`
- `outputContractId`
- `lifecyclePolicy`
- `readinessStatus`
- `blockedReasonIds`
- `missingEnvelopeFields`
- `rejectedEnvelopeFields`
- `staleEnvelopeFields`
- `lifecyclePolicyResults`
- `outputArtifactSummary`
- `processLaunchAttempted`
- `shellExecutionAttempted`
- `credentialAccessAttempted`
- `externalSendAttempted`
- `processLaunchAllowed`
- `executionAllowed`
- `disabledReason`

Safety-critical values to render when present:

- `disabledReason: subscription_agent_process_launch_not_enabled`
- `readinessStatus: blocked_pending_exact_launch_approval`
- `launchPolicyId: epic-8-first-subscription-launch-policy-v1`
- `commandTemplateExecutable: false` if available through readiness or lifecycle evidence
- `workflowEventRawOutputAllowed: false`
- `rawOutputStored: false`
- `processLaunchAttempted: false`
- `shellExecutionAttempted: false`
- `credentialAccessAttempted: false`
- `externalSendAttempted: false`
- `processLaunchAllowed: false`
- `executionAllowed: false`

### Architecture Guardrails

- `docs/prds/subscription-agent-launch-disabled-to-supervised-execution.md`
  - Dashboard must distinguish launch disabled, launch stub available, approved but not started, starting, running, cancellation requested, and terminal result.
  - Dashboard controls must remain unavailable until required gates and approvals are satisfied.
  - Workflow events must not embed raw process output; use byte counts, redaction/truncation status, artifact references, exit code, failure class, timeout/cancellation state.
- `docs/architecture/kendall-vnxt-dashboard-command-boundary-2026-06-08.md`
  - This story is `Execution-prohibited display`.
  - Do not add controls that launch subscription-agent processes, call providers, run shell commands, mutate source, grant network access, read credentials, or start background assistants.
- `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md`
  - Display lifecycle evidence below the stop line only.
  - Future process execution attaches to `ExecutionAttempt`, not `QueueLease`.
  - Required future evidence includes heartbeat, child process tree tracking, timeout, cancellation, terminal-state reconciliation, orphan detection, and idempotent cleanup.
- `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`
  - Credential access, provider/model calls, arbitrary commands, source mutation, worker network access, broad snapshot export, and background runtime assistant behavior remain denied.

### Implementation Guidance

- Start with a failing dashboard E2E test for a work item with a recorded subscription launch stub event.
- Prefer deriving display state from persisted event payloads and runtime export data already loaded by the work-item detail page. Do not introduce a second backend readiness model unless the current evidence is insufficient.
- Use small helper functions to safely read strings, booleans, arrays, and records from `Record<string, unknown>` event payloads.
- Choose UI copy that says `Launch blocked`, `Dry-run evidence only`, `Approval missing`, or `Readiness only`; avoid `Ready to launch` unless a later story actually approves launch.
- For missing evidence, show an explicit no-evidence row and next action such as `Create disabled launch stub evidence before requesting exact launch approval`.
- For blocked evidence, show the smallest next safe action based on the first/most specific missing, rejected, or stale field. Do not tell Bob to run or approve a real launch in this story.
- Artifact references are metadata only. Display artifact id/kind/path/operator-review status if present, but never display raw artifact contents.
- Keep cards compact and consistent with existing dashboard panels. Avoid adding a landing-page or marketing-style UI.
- No new dependencies should be needed.

### Testing

- Focused dashboard E2E:
  - `pnpm.cmd run test:e2e:dashboard:detail`
  - If the runner grep remains too narrow, either update `scripts/run-detail-e2e.mjs` to include the new detail test or document the exact Playwright grep used.
- Dashboard build:
  - `pnpm.cmd --filter @kendall/dashboard build`
- Documentation/story artifact checks:
  - `pnpm.cmd run check:docs`
- Broader verification:
  - `pnpm.cmd run check`
- If backend response shape changes, run focused supervisor tests:
  - `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch_stub"`
- No live subscription-agent process, provider, network, credential, GitHub mutation, PR/merge/cleanup, branch/worktree deletion, or source-mutation verification is allowed for this story.

### References

- `_bmad-output/planning-artifacts/epics.md`
- `docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md`
- `docs/goals/epic-8-first-subscription-launch-policy-2026-06-12.md`
- `docs/stories/8-1-refresh-subscription-agent-launch-approval-packet-from-epic-7-evidence.md`
- `docs/stories/8-2-define-first-launch-target-policy-and-execution-envelope.md`
- `docs/stories/8-3-implement-disabled-dry-run-process-supervisor-adapter.md`
- `docs/stories/5-4-subscription-launch-supervisor-lifecycle-disabled-adapter.md`
- `docs/prds/subscription-agent-launch-disabled-to-supervised-execution.md`
- `docs/architecture/kendall-vnxt-dashboard-command-boundary-2026-06-08.md`
- `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md`
- `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`
- `apps/dashboard/src/app/work-items/[work-item-id]/page.tsx`
- `apps/dashboard/src/components/green-gate-readiness-panel.tsx`
- `apps/dashboard/src/components/runtime-evidence-export-panel.tsx`
- `tests/e2e/dashboard.spec.ts`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-06-12: `node -e "import('./scripts/dashboard-e2e-runner.mjs').then(m=>m.runFocusedDashboardE2E({databaseName:'e2e-subscription-launch-readiness-red',grep:'shows subscription launch readiness without execution controls'})).then(code=>process.exit(code))"` failed before implementation because the `Launch readiness` link/panel did not exist.
- 2026-06-12: `node -e "import('./scripts/dashboard-e2e-runner.mjs').then(m=>m.runFocusedDashboardE2E({databaseName:'e2e-subscription-launch-readiness-final',grep:'shows subscription launch readiness without execution controls'})).then(code=>process.exit(code))"` passed, 1 test passed.
- 2026-06-12: `pnpm.cmd run test:e2e:dashboard:detail` passed, 1 test passed.
- 2026-06-12: `pnpm.cmd --filter @kendall/dashboard build` passed.
- 2026-06-12: `pnpm.cmd run check:docs` passed.
- 2026-06-12: `pnpm.cmd run check:runtime-export` passed after aligning the runtime export drift checker with the current dashboard detail assertions.
- 2026-06-12: `pnpm.cmd run check` failed inside the sandbox at `next build` because Google Fonts fetches for `IBM Plex Mono` and `Space Grotesk` were blocked by sandbox network restrictions.
- 2026-06-12: `pnpm.cmd run check` passed outside the sandbox with approval; dashboard build succeeded and supervisor tests reported 153 passed, 1 warning.
- 2026-06-12: Code review completed with 6 patch findings; all 6 review findings were fixed and checked off.
- 2026-06-12: `pnpm.cmd run check:runtime-export` passed after adding subscription launch readiness panel drift guards.
- 2026-06-12: `pnpm.cmd --filter @kendall/dashboard build` passed after review fixes.
- 2026-06-12: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch_stub"` passed, 3 tests passed, 95 deselected, 1 warning.
- 2026-06-12: `pnpm.cmd run test:e2e:dashboard:detail` passed, 1 test passed.
- 2026-06-12: `node -e "import('./scripts/dashboard-e2e-runner.mjs').then(m=>m.runFocusedDashboardE2E({databaseName:'e2e-subscription-launch-readiness-review-fixes-2',grep:'shows subscription launch readiness without execution controls'})).then(code=>process.exit(code))"` passed, 1 test passed.
- 2026-06-12: `pnpm.cmd run check` failed inside the sandbox at `next build` because Google Fonts fetches were blocked by sandbox network restrictions.
- 2026-06-12: `pnpm.cmd run check` passed outside the sandbox with approval; dashboard build succeeded and supervisor tests reported 153 passed, 1 warning.

### Completion Notes List

- Added `SubscriptionLaunchReadinessPanel` as a read-only Dev Console detail panel for persisted subscription launch stub evidence.
- Wired a `Launch readiness` anchor and panel into the work-item detail page without adding launch, approval, shell, provider, credential, source mutation, GitHub, PR, merge, or cleanup controls.
- The panel shows no-evidence state, blocked readiness status, disabled reason, missing/rejected/stale approval fields, policy/template/workspace/output ids, lifecycle policy evidence, artifact-reference-only metadata, raw-output exclusion copy, and disabled authority flags.
- Added focused Playwright coverage for the no-evidence and recorded launch-stub evidence states, including exact blocked fields and absence of raw payload content.
- Updated stale runtime-export browser drift expectations so the full check reflects the current dashboard detail surface.
- Fixed review findings by selecting the latest launch event across both persisted event sources, showing incomplete evidence as incomplete instead of projected readiness, surfacing command template executable state plus lifecycle state mapping and terminal states, and labeling attempted audit flags separately from allowed authority flags.
- Extended supervisor, dashboard E2E, and runtime-export drift checks to pin the review-fix behavior.

### File List

- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/dashboard/src/app/work-items/[work-item-id]/page.tsx`
- `apps/dashboard/src/components/subscription-launch-readiness-panel.tsx`
- `docs/stories/8-4-show-subscription-launch-readiness-in-dev-console.md`
- `scripts/check-runtime-evidence-export.mjs`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `tests/e2e/dashboard.spec.ts`

## Change Log

- 2026-06-12: Implemented Story 8.4 subscription launch readiness display in the Dev Console and moved story to review.
- 2026-06-12: Addressed Story 8.4 code-review findings and moved story to done.
