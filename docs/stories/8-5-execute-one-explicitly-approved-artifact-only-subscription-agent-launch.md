---
baseline_commit: 84465778a690822cbefc63dd4c5d6a81bfab9fb8
---

# Story 8.5: Execute One Explicitly Approved Artifact-Only Subscription-Agent Launch

Date: 2026-06-12
Status: done

## Story

As Bob,
I want Kendall to launch exactly one approved subscription-agent target in artifact-only or patch-only mode,
so that we can prove supervised process execution without granting source mutation, secrets, provider expansion, or broad autonomy.

## Acceptance Criteria

1. Given no exact launch envelope has been approved, when a subscription-agent launch is requested, then Kendall rejects the request before process start, records metadata-only rejection evidence, and keeps `processLaunchAttempted: false`.
2. Given Bob approves an exact non-stale launch envelope naming work item, execution attempt, route decision, worker, lane, authority mode, workspace plan, launch policy, target, command template, approval actor/timestamp/expiry, environment allowlist, blocked credential/session paths, artifact limits, redaction/truncation behavior, timeout/cancel policy, dashboard controls, rollback, verification command, and allowed output mode, when Kendall evaluates the launch request, then exactly one execution attempt can enter a launch-starting path for that approved envelope only.
3. Given a launch is allowed by the exact envelope, when Kendall starts the subscription-agent process, then the process uses only the approved command template, the approved working directory/workspace plan, the approved environment allowlist, and artifact-only or patch-only output; it must not inherit `.env`, `.ssh`, credential stores, tokens, browser/session stores, shell profiles, provider credentials, or arbitrary environment values.
4. Given the launched process completes, fails, times out, or is cancelled, when terminal evidence is recorded, then workflow events retain only bounded metadata, byte counts, redaction/truncation status, exit code/failure class, timeout/cancellation state, and artifact references; raw stdout, raw stderr, generated patch content, prompts, completions, provider payloads, secrets, and source snapshots are not embedded in workflow events.
5. Given launch evidence is recorded, when Bob views the Dev Console work-item detail and runtime evidence export, then launch state distinguishes approved-not-started, starting, running, cancel requested, completed, failed, timed out, cancelled, rollback-disabled, and rejected states where applicable without adding broad launch/autonomy controls.
6. Given any approval field, target, command template, workspace plan, output policy, timeout/cancel policy, verification command, dashboard control posture, rollback policy, or artifact policy changes after approval, when Kendall re-evaluates launch readiness, then the approval is stale, new launch is blocked, and the stale field plus next safe action are visible.
7. Given Story 8.5 completes, then source mutation, issue sync, PR creation/update, merge, cleanup, failed-check bypass, provider/model calls, Claude launch, credential/session access, network expansion, and broad autonomy remain blocked unless separately approved by a later exact authority packet.

## Tasks / Subtasks

- [x] Add an exact subscription launch approval contract and rejection path. (AC: 1, 2, 6, 7)
  - [x] Add explicit request/response contract types for the approved launch path; do not overload `WorkItemSubscriptionAgentLaunchStubRequest` or `SubscriptionAgentLaunchStubView`.
  - [x] Require every exact-envelope field named in AC2; reject missing, mismatched, expired, stale, or unsupported fields before any subprocess call.
  - [x] Record rejection events such as `routing.subscription_agent_launch_rejected` or `execution_attempt.subscription_launch_rejected` with `processLaunchAttempted: false`, `shellExecutionAttempted: false`, and stable blocked reason ids.
  - [x] Preserve the disabled stub endpoint at `/work-items/{work_item_id}/subscription-agent-launch-stub` as readiness-only evidence.
- [x] Implement the narrow approved launch adapter behind explicit stop lines. (AC: 2, 3, 4, 7)
  - [x] Add a new adapter or service method separate from `DisabledSubscriptionLaunchAdapter` for exact-approved execution; keep disabled adapter defaults unchanged.
  - [x] Use the existing `ExecutionAttempt` model for lifecycle evidence; do not attach process launch authority to queue leases.
  - [x] Permit at most one active subscription-agent launch attempt per work item and approval envelope.
  - [x] If exact approval has not been supplied in the current dev workflow, stop at the pre-launch approval gate and implement only rejection/evaluation paths.
  - [x] If exact approval is supplied later, run only the approved command template with approved cwd, timeouts, environment allowlist, and artifact limits.
- [x] Enforce workspace, environment, credential, and output boundaries. (AC: 3, 4, 7)
  - [x] Reuse `SUBSCRIPTION_LAUNCH_FORBIDDEN_PATHS` and blocked credential/session path evidence from `services/supervisor/src/supervisor/domain/subscription_launch.py`.
  - [x] Do not inherit arbitrary `os.environ`; construct the subprocess environment only from approved allowlist keys.
  - [x] Store output as bounded artifacts under an approved artifact root; workflow events may reference artifact ids/paths and byte counts only.
  - [x] Do not apply generated patches, mutate source, write PRs, merge, clean up worktrees, issue sync, call providers, or access credentials.
- [x] Extend persisted lifecycle, runtime export, and Dev Console evidence. (AC: 4, 5, 6)
  - [x] Emit launch-started, running/heartbeat where applicable, terminal, rejection, stale-approval, timeout, cancellation, and rollback-disabled metadata events.
  - [x] Update `RuntimeEvidenceExportView` production so exports include approval binding, lifecycle summary, workspace summary, output artifact references, safety flags, cancellation/timeout/rollback evidence, and related reports without raw output.
  - [x] Update `SubscriptionLaunchReadinessPanel` or an adjacent focused panel to show approved-not-started, starting, running, cancel requested, terminal, stale, rejected, and rollback-disabled states.
  - [x] Do not add a broad dashboard "Launch" button. Any dashboard control added in this story must be disabled unless every approved-envelope and authority gate is satisfied.
- [x] Add focused backend and dashboard tests. (AC: 1-7)
  - [x] Add supervisor tests for missing approval rejection, stale approval rejection, envelope mismatch rejection, exact approved launch path, timeout, cancellation, terminal evidence, raw-output exclusion, and credential/session denial.
  - [x] Add dashboard E2E coverage showing rejected/blocked and approved/terminal evidence without raw output or broad controls.
  - [x] Add or update static drift checks so subscription launch process authority cannot be silently broadened by future changes.
  - [x] Keep tests deterministic; use a safe local fixture command or fake adapter unless Bob explicitly approves a real subscription CLI process launch for this story.
- [x] Update story evidence after implementation. (AC: 1-7)
  - [x] Record the exact launch approval packet if Bob supplies one, including authority family, operation, scope, stop lines, output mode, verification command, and expiry.
  - [x] Record every verification command and result in this story file.
  - [x] Update File List and Completion Notes with every changed file.

### Review Findings (AI)

- [x] [Review][Patch] Exact-envelope validation only compares the identity fields; safety envelope fields are only checked for non-empty presence. [services/supervisor/src/supervisor/application/service.py:7216]
- [x] [Review][Patch] Approval expiry is parsed and required but never evaluated as expired or stale. [services/supervisor/src/supervisor/application/service.py:7230]
- [x] [Review][Patch] Rejection events persist caller-supplied approval binding content without bounding or sanitizing nested values. [services/supervisor/src/supervisor/application/service.py:7300]
- [x] [Review][Patch] Stale-field audit evidence overwrites submitted mismatched values with expected values in `approvalBinding`. [services/supervisor/src/supervisor/application/service.py:7300]
- [x] [Review][Patch] Rejection events omit workspace and lifecycle evidence that the dashboard/runtime evidence path expects to render. [services/supervisor/src/supervisor/application/service.py:7426]
- [x] [Review][Patch] Dashboard recomputes launch `nextSafeAction` instead of using the persisted backend decision. [apps/dashboard/src/components/subscription-launch-readiness-panel.tsx:66]
- [x] [Review][Patch] Unknown `requestedAgent` values fall back to the default Codex target instead of being rejected as unsupported input. [services/supervisor/src/supervisor/application/service.py:7207]
- [x] [Review][Patch] Focused backend tests do not cover expired approval, stale/mismatched envelope fields, unsupported safety values, unknown requested agents, or nested raw-output leakage. [services/supervisor/tests/integration/test_routing_preview.py:2426]
- [x] [Review][Defer] Static drift check remains string-grep coverage rather than behavioral coverage. [scripts/check-runtime-evidence-export.mjs:123] - deferred, pre-existing pattern in this repo.

### Review Findings (BMAD Code Review - Accepted Fixture Pass)

- [x] [Review][Decision] Exact approval timestamp and expiry are not validated against the recorded accepted packet - resolved by Bob choosing option 1: Story 8.5 runtime validation binds to the literal recorded packet timestamp/expiry. Fresh Bob timestamp/expiry pairs are stale unless they match the recorded packet, and the recorded packet blocks as expired after `2026-06-12T16:50:33.2776334-05:00`.
- [x] [Review][Decision] Artifact-only fixture evidence reports process launch allowed/attempted even though no OS process or shell command starts - resolved by Bob choosing option 1: keep `processLaunchAllowed`, `executionAllowed`, and `processLaunchAttempted` true for the approved Story 8.5 artifact-only fixture-start path. In this story those fields mean the approval-bound fixture launch-starting path was entered; `shellExecutionAttempted`, credential, network, provider, and source mutation flags remain false, and workspace isolation still records `commandsAllowed: false`.
- [x] [Review][Decision] Accepted launch validation does not require a retained stub/readiness event - resolved by Bob choosing option 2: allow recomputed readiness evidence. Story 8.5 launch evaluation may recompute route/workspace binding and evaluate the exact envelope without requiring a persisted `routing.subscription_agent_launch_stub_created` event first.
- [x] [Review][Patch] Accepted artifact-only launch responses still included `real_process_launch_not_approved` in blocked reasons. [services/supervisor/src/supervisor/application/service.py:7318]
- [x] [Review][Patch] Future-dated approval timestamps could be accepted when expiry was later than the future timestamp. [services/supervisor/src/supervisor/application/service.py:7274]
- [x] [Review][Patch] A second completed fixture attempt for the same work item could be accepted with a new execution attempt id. [services/supervisor/src/supervisor/application/service.py:7424]
- [x] [Review][Patch] Duplicate accepted launch insert races could surface as uncaught database integrity failures instead of controlled invalid-launch responses. [services/supervisor/src/supervisor/application/service.py:7449]
- [x] [Review][Patch] Fixture attempt event references could be copied before started/completed workflow event ids were flushed. [services/supervisor/src/supervisor/application/service.py:7477]
- [x] [Review][Patch] Dashboard latest-event selection could show `fixture_started` instead of `fixture_completed` when both events shared a timestamp. [apps/dashboard/src/components/subscription-launch-readiness-panel.tsx:63]

### Review Findings (BMAD Code Review - Completion Pass)

- [x] [Review][Patch] Accepted fixture evidence grants command execution even though shell commands remain denied. [services/supervisor/src/supervisor/application/service.py:7462]
- [x] [Review][Patch] Rejected launch requests can skip persisted rejection evidence when `recordEvent` is omitted or false. [services/supervisor/src/supervisor/application/service.py:7509]
- [x] [Review][Patch] Rejection approval binding fills missing submitted approval fields with expected approved values. [services/supervisor/src/supervisor/application/service.py:7756]
- [x] [Review][Patch] Disabled stub approval binding omits launch request timeout/truncation fields and forces tests to hand-patch the generated envelope. [services/supervisor/src/supervisor/domain/subscription_launch.py:222]
- [x] [Review][Patch] Accepted launch can use a caller-supplied execution attempt id instead of the retained route decision attempt id. [services/supervisor/src/supervisor/application/service.py:7341]
- [x] [Review][Patch] Later readiness-only events can override completed fixture evidence in runtime export and dashboard latest-event selection. [services/supervisor/src/supervisor/application/service.py:5697]
- [x] [Review][Patch] Timeout, cancellation, and rollback-disabled lifecycle evidence is represented only as policy text, not persisted metadata events. [services/supervisor/src/supervisor/application/service.py:7587]

## Dev Notes

### Authority Posture

Story 8.5 is the first Epic 8 candidate that may cross the subscription-agent real-process stop line, but it is not pre-approved by story creation. The dev agent must treat real launch as blocked until Bob supplies an exact approval packet during implementation.

Required approval packet before any real process start:

- authority family: `subscription-agent launch`
- operation: `start exactly one subscription-agent process`
- scope: one work item id, one execution attempt id, one route decision id, one worker id, one lane, one authority mode, one workspace plan id, one launch policy id, one target id, one command template id, one allowed output mode
- safety envelope: environment allowlist, blocked credential/session paths, artifact size/retention limits, redaction/truncation behavior, startup/run/cancellation timeouts, heartbeat policy, child-process tree tracking, orphan detection, terminal reconciliation, idempotent cleanup, rollback/global-disable procedure
- evidence: approval actor, approval timestamp, approval expiry, approved verification command, dashboard controls/copy posture, expected artifact references, stop lines

Generic "continue", "proceed", or story creation approval is not approval for real process launch.

### Source Requirements From Epic 8

- Epic 8 objective: convert the deferred subscription-agent launch stop-line into a staged approval-bound launch path, starting below the real-process boundary and eventually proving one explicitly approved artifact-only or patch-only launch.
- Cross-story invariant: no story may grant broad autonomy, secret access, provider expansion, issue sync, source mutation, failed-check bypass, Claude launch, or subscription-agent process launch beyond the exact approval envelope named for that story.
- Story 8.5 from the epic requires exactly one approved subscription-agent target and artifact-only or patch-only output.

### Prior Story Intelligence

- Story 8.1 created `docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md`.
  - Stories 8.1 through 8.4 did not approve real launch.
  - Story 8.5 may request exact approval but remains blocked if any envelope field is missing, stale, or rejected.
  - Latest-attempt evidence binding must reject stale launch evidence from older attempts.
- Story 8.2 created `docs/goals/epic-8-first-subscription-launch-policy-2026-06-12.md`.
  - Launch policy id: `epic-8-first-subscription-launch-policy-v1`.
  - Current target status in that policy: `not-approved`.
  - Required exact envelope fields include work item, attempt, route decision, worker, lane, authority mode, workspace plan, launch policy, target, command template, approval actor/timestamp/expiry, permission envelope, environment allowlist, blocked paths, artifact limits, output policy, timeout/cancel policies, lifecycle policies, dashboard controls, rollback, verification command, and output mode.
  - Source mutation remains denied; patch output is retained for operator review only.
- Story 8.3 established disabled/dry-run launch evidence in `services/supervisor/src/supervisor/domain/subscription_launch.py`, `services/supervisor/src/supervisor/application/service.py`, `services/supervisor/src/supervisor/api/schemas.py`, `packages/contracts/src/api.ts`, and `services/supervisor/tests/integration/test_routing_preview.py`.
  - `DisabledSubscriptionLaunchAdapter` must remain disabled and metadata-only.
  - `SUBSCRIPTION_LAUNCH_FORBIDDEN_PATHS` is the existing blocked credential/session path source.
  - Existing stub event type: `routing.subscription_agent_launch_stub_created`.
- Story 8.4 added Dev Console readiness in `apps/dashboard/src/components/subscription-launch-readiness-panel.tsx`.
  - Review fixes selected latest evidence across both direct events and runtime export.
  - Partial evidence displays as incomplete, not projected readiness.
  - Attempt audit flags are labeled separately from authority allowance flags.
  - Lifecycle state mapping, terminal states, and command template executable state are visible.

### Existing Implementation To Reuse

- Supervisor routes:
  - `services/supervisor/src/supervisor/api/main.py`
  - Existing stub route: `POST /work-items/{work_item_id}/subscription-agent-launch-stub`.
  - Existing execution attempt routes: create, transition, verification evidence.
- Supervisor service:
  - `services/supervisor/src/supervisor/application/service.py`
  - `create_execution_attempt` attaches route decision, worker, lane, authority mode, workspace isolation plan, artifact refs, and initial event evidence.
  - `transition_execution_attempt` validates approval binding for approved transitions and records rejection events when subscription launch approval fields are invalid.
  - `launch_supervised_codex_worker` is a precedent for explicit approval-bound process launch, but it is not safe to copy wholesale because it uses Codex-specific authority, source-mutation semantics, and `sourceMutationAllowed: True` in launch event evidence.
  - `_record_subscription_agent_launch_stub_event` already persists launch policy, target, command template, workspace plan, output contract, lifecycle evidence, readiness evidence, artifact summary, and disabled authority flags.
- Domain:
  - `services/supervisor/src/supervisor/domain/subscription_launch.py`
  - Extend with a new exact-approved launch evaluator/adapter instead of weakening `DisabledSubscriptionLaunchAdapter`.
  - Keep target registry disabled by default unless exact approval and settings allow the target.
- Contracts and schemas:
  - `services/supervisor/src/supervisor/api/schemas.py`
  - `packages/contracts/src/api.ts`
  - Current `SubscriptionAgentLaunchStubView` is for readiness-only evidence. Add separate approved-launch request/view contracts if needed.
- Dashboard:
  - `apps/dashboard/src/app/work-items/[work-item-id]/page.tsx`
  - `apps/dashboard/src/components/subscription-launch-readiness-panel.tsx`
  - `apps/dashboard/src/components/execution-attempt-evidence-panel.tsx`
  - `apps/dashboard/src/components/runtime-evidence-export-panel.tsx`
  - Do not add a broad launch control. Prefer display-first evidence; only add a control if it is disabled until all exact authority gates pass.
- Tests:
  - `services/supervisor/tests/integration/test_routing_preview.py` currently covers disabled launch stub evidence.
  - `tests/e2e/dashboard.spec.ts` includes Story 8.4 work-item detail coverage.
  - Static drift checks include `scripts/check-runtime-evidence-export.mjs`, `scripts/check-process-lifecycle-policy.mjs`, and `scripts/check-execution-boundary-reports.mjs`.

### Architecture Guardrails

- `docs/prds/subscription-agent-launch-disabled-to-supervised-execution.md`
  - Launch attaches to `ExecutionAttempt`, not `QueueLease`.
  - Launch requires exact approval binding before process start.
  - Workflow events must not embed raw process output.
  - Direct launch must not inherit arbitrary credentials or session state.
  - Runtime evidence exports include approval binding, process lifecycle summary, workspace summary, output artifact references, safety flags, cancellation/timeout/rollback evidence, and related reports.
- `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`
  - Stories 5.1-5.4 are non-executing preparation only; Story 5.5 remained blocked pending explicit process-launch approval.
  - Approval must name authority family, operation, scope, limits, evidence, and stop lines.
- `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md`
  - Process lifecycle evidence must include heartbeat, child-process tracking, orphan detection, terminal reconciliation, timeout, cancellation, idempotent cleanup, and rollback.
- `docs/architecture/kendall-vnxt-dashboard-command-boundary-2026-06-08.md`
  - Dashboard controls must stay unavailable until all gates and approvals are satisfied.
- `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`
  - Credential access, provider/model calls, arbitrary commands, broad worker network access, source mutation, and background runtime assistant behavior remain denied unless separately approved.

### Implementation Guidance

- Start with failing supervisor tests for missing exact approval, stale/mismatched approval, and raw-output exclusion.
- Model launch approval as data first. Add exact-envelope validation before adding any subprocess path.
- Prefer a fake or safe local fixture command for automated tests. Do not start a subscription CLI unless Bob gives exact approval in the current implementation workflow.
- If implementing a real subprocess path after approval, use `subprocess.run` or `asyncio.create_subprocess_exec` with:
  - argument array, not shell string;
  - approved cwd only;
  - environment built from explicit allowlist only;
  - timeout from approved envelope;
  - bounded capture and artifact write;
  - no raw stdout/stderr in workflow event payload;
  - no destructive cleanup unless separately approved.
- Treat generated patches as artifacts only. Never apply them in this story.
- Record both attempted and allowed flags. Do not use copy or field names that turn attempted audit flags into authority grants.
- Keep launch result evidence latest-attempt bound; old approvals or old terminal evidence must not make current launch readiness green.

### Testing

- Focused supervisor tests:
  - `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch"`
  - Add more specific `-k` filters if new test names are introduced.
- Dashboard E2E:
  - `pnpm.cmd run test:e2e:dashboard:detail`
  - If the existing runner grep does not include new 8.5 coverage, use `node -e "import('./scripts/dashboard-e2e-runner.mjs').then(m=>m.runFocusedDashboardE2E({databaseName:'e2e-subscription-launch-approved',grep:'<new test name>'})).then(code=>process.exit(code))"`.
- Static drift checks:
  - `pnpm.cmd run check:process-lifecycle`
  - `pnpm.cmd run check:runtime-export`
  - `pnpm.cmd run check:execution-boundary`
- Dashboard build:
  - `pnpm.cmd --filter @kendall/dashboard build`
- Full check:
  - `pnpm.cmd run check`
  - In the Windows sandbox this may fail at Next.js Google Fonts fetch; rerun the same read-only command outside the sandbox when that is the only failure.

### References

- `_bmad-output/planning-artifacts/epics.md`
- `docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md`
- `docs/goals/epic-8-first-subscription-launch-policy-2026-06-12.md`
- `docs/stories/8-1-refresh-subscription-agent-launch-approval-packet-from-epic-7-evidence.md`
- `docs/stories/8-2-define-first-launch-target-policy-and-execution-envelope.md`
- `docs/stories/8-3-implement-disabled-dry-run-process-supervisor-adapter.md`
- `docs/stories/8-4-show-subscription-launch-readiness-in-dev-console.md`
- `docs/stories/5-5-subscription-launch-supervised-process-behind-approval.md`
- `docs/prds/subscription-agent-launch-disabled-to-supervised-execution.md`
- `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`
- `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md`
- `docs/architecture/kendall-vnxt-dashboard-command-boundary-2026-06-08.md`
- `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`
- `services/supervisor/src/supervisor/domain/subscription_launch.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `packages/contracts/src/api.ts`
- `apps/dashboard/src/components/subscription-launch-readiness-panel.tsx`
- `tests/e2e/dashboard.spec.ts`
- `services/supervisor/tests/integration/test_routing_preview.py`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch_request"` - red phase failed with 404 before the launch request endpoint existed.
- `pnpm.cmd run check:runtime-export` - passed.
- `pnpm.cmd --filter @kendall/dashboard build` - passed.
- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch_request"` - passed: 2 passed, 98 deselected.
- `node -e "import('./scripts/dashboard-e2e-runner.mjs').then(m=>m.runFocusedDashboardE2E({databaseName:'e2e-subscription-launch-rejected-request',grep:'shows rejected subscription launch request evidence without raw output or launch controls'})).then(code=>process.exit(code))"` - first run failed because the fixture submitted a sparse request that surfaced server-known id fields before approval fields; fixture corrected to reuse the disabled stub binding and omit only exact approval fields.
- `node -e "import('./scripts/dashboard-e2e-runner.mjs').then(m=>m.runFocusedDashboardE2E({databaseName:'e2e-subscription-launch-rejected-request',grep:'shows rejected subscription launch request evidence without raw output or launch controls'})).then(code=>process.exit(code))"` - passed: 1 passed.
- `pnpm.cmd run check` - sandbox run failed only at Next.js Google Fonts fetch during dashboard build.
- `pnpm.cmd run check` - passed outside sandbox: dashboard build passed and supervisor suite passed with 155 tests.
- Drafted proposed Story 8.5 exact launch approval packet in `docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md`; packet remains proposed and not accepted approval.
- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch_request"` - review fixes passed: 4 passed, 98 deselected.
- `pnpm.cmd --filter @kendall/dashboard build` - review fixes passed.
- `node -e "import('./scripts/dashboard-e2e-runner.mjs').then(m=>m.runFocusedDashboardE2E({databaseName:'e2e-subscription-launch-rejected-request',grep:'shows rejected subscription launch request evidence without raw output or launch controls'})).then(code=>process.exit(code))"` - review fixes passed: 1 passed.
- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch"` - review fixes passed: 7 passed, 95 deselected.
- `pnpm.cmd run check:runtime-export` - review fixes passed.
- Updated `docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md` from proposed to acceptance-ready; real launch remains blocked until Bob explicitly accepts the exact statement.
- Bob accepted the Story 8.5 exact subscription-agent launch approval packet for the artifact-only fixture path only at `2026-06-12T16:20:33.2776334-05:00`; expiry recorded as `2026-06-12T16:50:33.2776334-05:00`.
- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "accepts_exact_artifact_only_fixture_path"` - accepted fixture red/green passed: 1 passed, 102 deselected.
- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch"` - accepted fixture and rejection coverage passed: 8 passed, 95 deselected.
- `pnpm.cmd --filter @kendall/dashboard build` - accepted fixture dashboard changes passed.
- `node -e "import('./scripts/dashboard-e2e-runner.mjs').then(m=>m.runFocusedDashboardE2E({databaseName:'e2e-subscription-launch-accepted-fixture',grep:'shows accepted subscription launch fixture evidence without raw output or launch controls'})).then(code=>process.exit(code))"` - accepted fixture dashboard E2E passed: 1 passed.
- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch"` - BMAD accepted fixture review fixes passed: 10 passed, 95 deselected.
- `pnpm.cmd --filter @kendall/dashboard build` - BMAD accepted fixture review fixes passed.
- `pnpm.cmd run check:runtime-export` - BMAD accepted fixture review fixes passed.
- `node -e "import('./scripts/dashboard-e2e-runner.mjs').then(m=>m.runFocusedDashboardE2E({databaseName:'e2e-subscription-launch-accepted-fixture',grep:'shows accepted subscription launch fixture evidence without raw output or launch controls'})).then(code=>process.exit(code))"` - BMAD accepted fixture review fixes passed: 1 passed.
- `pnpm.cmd run check` - sandbox run failed only at Next.js Google Fonts fetch during dashboard build.
- `pnpm.cmd run check` - passed outside sandbox: dashboard build passed and supervisor suite passed with 160 tests.
- Bob selected review decision option 1: Story 8.5 runtime acceptance must bind to the literal recorded approval timestamp/expiry.
- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch"` - exact packet timestamp/expiry binding passed: 10 passed, 95 deselected.
- `pnpm.cmd --filter @kendall/dashboard build` - exact packet timestamp/expiry binding passed.
- `node -e "import('./scripts/dashboard-e2e-runner.mjs').then(m=>m.runFocusedDashboardE2E({databaseName:'e2e-subscription-launch-expired-exact-approval',grep:'shows expired exact subscription launch approval evidence without raw output or launch controls'})).then(code=>process.exit(code))"` - exact expired approval dashboard E2E passed: 1 passed.
- `pnpm.cmd run check:runtime-export` - exact packet timestamp/expiry binding passed.
- `pnpm.cmd run check:docs` - exact packet timestamp/expiry binding story updates passed.
- `pnpm.cmd run check` - sandbox run failed only at Next.js Google Fonts fetch during dashboard build.
- `pnpm.cmd run check` - exact packet timestamp/expiry binding passed outside sandbox: dashboard build passed and supervisor suite passed with 160 tests.
- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "runtime_evidence_export_includes_subscription_launch_summary"` - red phase failed before `subscriptionLaunch` export summary existed.
- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "runtime_evidence_export_includes_subscription_launch_summary"` - runtime export subscription launch summary passed: 1 passed, 105 deselected.
- `pnpm.cmd run check:runtime-export` - subscription launch runtime export drift checks passed.
- `pnpm.cmd --filter @kendall/dashboard build` - subscription launch runtime export panel passed.
- `node -e "import('./scripts/dashboard-e2e-runner.mjs').then(m=>m.runFocusedDashboardE2E({databaseName:'e2e-subscription-launch-expired-exact-approval',grep:'shows expired exact subscription launch approval evidence without raw output or launch controls'})).then(code=>process.exit(code))"` - runtime export subscription launch panel E2E passed: 1 passed.
- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch or runtime_evidence_export_includes_subscription_launch_summary"` - lifecycle/export/credential coverage passed: 11 passed, 95 deselected.
- `pnpm.cmd run check` - sandbox run failed only at Next.js Google Fonts fetch during dashboard build.
- `pnpm.cmd run check` - Story 8.5 completion passed outside sandbox: dashboard build passed and supervisor suite passed with 161 tests.
- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch or runtime_evidence_export_includes_subscription_launch_summary"` - completion-pass BMAD review fixes passed: 11 passed, 95 deselected.
- `pnpm.cmd run check:runtime-export` - completion-pass BMAD review fixes passed.
- `pnpm.cmd --filter @kendall/dashboard build` - completion-pass BMAD review fixes passed.
- `node -e "import('./scripts/dashboard-e2e-runner.mjs').then(m=>m.runFocusedDashboardE2E({databaseName:'e2e-subscription-launch-expired-exact-approval',grep:'shows expired exact subscription launch approval evidence without raw output or launch controls'})).then(code=>process.exit(code))"` - completion-pass BMAD review fixes passed: 1 passed.
- `pnpm.cmd run check` - sandbox run failed only at Next.js Google Fonts fetch during dashboard build.
- `pnpm.cmd run check` - completion-pass BMAD review fixes passed outside sandbox: dashboard build passed and supervisor suite passed with 161 tests.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Implemented the non-executing Story 8.5 approval evaluation/rejection slice. The new `/work-items/{work_item_id}/subscription-agent-launch` route validates a separate exact launch request contract and records metadata-only rejection evidence before any process, shell, credential, provider, network, or source-mutation attempt.
- Added shared API contracts and supervisor schemas for launch requests and launch request evidence without weakening the existing disabled stub contract or route.
- Extended launch readiness rendering to include rejected launch request events and added dashboard E2E coverage proving rejected evidence is visible without raw output or broad launch controls.
- Real subscription-agent process launch remains blocked. No exact approval packet was supplied in this dev workflow, so the approved adapter, subprocess start path, terminal lifecycle states, timeout/cancellation handling, and exact-approved launch tests remain unchecked.
- Added a proposed exact approval packet for Story 8.5 that names the authority family, operation, scope, safety envelope, evidence requirements, stop lines, and required Bob acceptance statement. This is not accepted launch approval yet.
- Resolved code review findings by validating the full exact launch envelope, enforcing approval expiry, rejecting unsupported target selectors, sanitizing retained approval evidence, preserving submitted stale-field evidence separately, emitting workspace/lifecycle evidence in rejection events, and using persisted backend next-safe-action text in the dashboard.
- Refined the Story 8.5 approval packet into an acceptance-ready artifact with an explicit accepted path and exact Bob acceptance statement. This still does not approve launch until Bob accepts the statement.
- Recorded Bob's exact Story 8.5 approval and implemented the accepted artifact-only fixture path. The path validates the exact envelope, creates one completed `ExecutionAttempt`, records fixture started/completed events, retains only artifact references and metadata, and leaves production subscription CLI launch plus all broader authorities blocked.
- Resolved BMAD accepted fixture review patch findings by clearing blocked reasons on accepted fixture responses, rejecting future-dated approvals, preventing second fixture attempts per work item, converting duplicate insert races into controlled invalid-launch responses, flushing fixture event ids before copying references, and preferring completed fixture events in dashboard readiness ordering.
- Bound Story 8.5 runtime acceptance to Bob's literal recorded approval timestamp/expiry. Fresh approval timestamps now make the envelope stale, and the accepted packet blocks as expired after the recorded expiry.
- Kept Story 8.5 artifact-only fixture semantics for `processLaunchAllowed`, `executionAllowed`, and `processLaunchAttempted` after Bob selected option 1. These flags describe the approved fixture-start path for this story, while shell/process-tree execution remains denied by separate evidence fields.
- Resolved the final policy-level BMAD review finding after Bob selected option 2: Story 8.5 does not require a retained stub/readiness event before launch evaluation; recomputed route/workspace binding is acceptable for this story.
- Added `RuntimeEvidenceSubscriptionLaunchView` to runtime exports so subscription launch evidence includes approval binding, lifecycle summary, workspace summary, artifact references, safety flags, cancellation/timeout/rollback evidence, and related reports without raw output.
- Extended the runtime export dashboard panel and E2E coverage to show stale subscription-launch evidence without broad launch controls or raw output.
- Strengthened supervisor tests for accepted fixture terminal lifecycle evidence, timeout/cancellation/rollback metadata, and credential/session path denial.
- Resolved completion-pass BMAD code review findings by keeping command execution denied on the accepted fixture evidence, always persisting rejection evidence, preserving missing approval fields as missing in approval binding evidence, binding accepted attempts to the route decision id, prioritizing completed evidence across runtime export and dashboard selection, and persisting timeout/cancellation/rollback-disabled metadata events.

### File List

- `apps/dashboard/src/components/subscription-launch-readiness-panel.tsx`
- `apps/dashboard/src/components/runtime-evidence-export-panel.tsx`
- `docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md`
- `docs/stories/8-5-execute-one-explicitly-approved-artifact-only-subscription-agent-launch.md`
- `_bmad-output/implementation-artifacts/deferred-work.md`
- `packages/contracts/src/api.ts`
- `scripts/check-runtime-evidence-export.mjs`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/domain/subscription_launch.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `tests/e2e/dashboard.spec.ts`

### Change Log

- 2026-06-12: Added non-executing exact launch approval evaluation, metadata-only rejection events, dashboard rejection evidence, and focused backend/dashboard guardrail tests.
- 2026-06-12: Drafted proposed Story 8.5 exact launch approval packet; real launch remains blocked pending explicit acceptance.
- 2026-06-12: Resolved BMAD code review findings for exact-envelope validation, expiry enforcement, target selector handling, sanitized rejection evidence, dashboard next-safe-action rendering, and focused guardrail tests.
- 2026-06-12: Refined Story 8.5 approval packet to acceptance-ready status with exact acceptance language and accepted-path constraints.
- 2026-06-12: Recorded accepted Story 8.5 artifact-only fixture approval and implemented accepted fixture launch evidence path.
- 2026-06-12: Completed runtime export subscription-launch summary, dashboard export rendering, lifecycle/timeout/cancellation/credential guardrail coverage, and moved story to review.
- 2026-06-12: Resolved completion-pass BMAD code review findings and moved Story 8.5 to done after focused checks, dashboard build, E2E, and full check passed.
