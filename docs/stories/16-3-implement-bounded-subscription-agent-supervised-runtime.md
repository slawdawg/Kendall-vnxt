---
baseline_commit: e5bffb706e5d2bcba856bfcee5aad0c57073e416
---

# Story 16.3: Implement Bounded Subscription-Agent Supervised Runtime

Status: done

## Story

As Bob,
I want the subscription-agent process-launch path to require an exact accepted launch approval before it can perform any supervised runtime action,
so that Kendall_Nxt can move beyond artifact-only fixture evidence without weakening workspace isolation, credential/session denial, metadata-only retention, rollback, or stop-line controls.

## Acceptance Criteria

1. Given subscription-agent launch gates are configured for an approved target/template, when a launch request omits an accepted process-launch approval instance, then the supervisor does not start a process and records/returns metadata-only rejection evidence.
2. Given a launch request includes an exact approval instance, when the broad gate, target gate, work item id, execution attempt id, route decision id, worker id, lane, authority mode, workspace plan id, launch policy id, target id, command template id, command argv, cwd, environment allowlist, blocked credential/session paths, artifact limits, redaction/truncation/output policy, startup/run/cancellation timeouts, heartbeat/orphan/reconciliation/cleanup policies, verification command, retained evidence, operator, approval timestamp, rollback path, stop lines, and expiry/review point all match the approval packet, then the supervisor may perform one bounded supervised launch through a new runtime adapter.
3. Given the approval instance is stale, expired, mismatched, underspecified, ambiguous, or attempts to reuse the Story 8.5 artifact-only fixture approval, when the request is handled, then the supervisor rejects before launch and preserves only metadata-only rejection evidence.
4. Given the approved runtime adapter starts, completes, fails, times out, or is cancelled, when the attempt is represented in API/event evidence, then raw stdout, raw stderr, generated patch contents, raw prompts, raw completions, provider payloads, credentials, session data, and full source snapshots are not retained in workflow events.
5. Given this story enables only bounded subscription-agent supervised runtime, when implementation completes, then it does not enable shell string execution, arbitrary environment inheritance, provider/model calls, source mutation, generated patch application, issue sync, PR delivery, cleanup automation, branch/worktree deletion, failed-check bypass, or broad autonomy.
6. Given verification runs, then focused subscription-agent launch tests pass, `pnpm.cmd run check:process-lifecycle` passes, and full `pnpm.cmd run check` passes.

## Tasks / Subtasks

- [x] Add exact process-launch approval instance contract. (AC: 1, 2, 3)
  - [x] Extend request/schema/contracts with runtime approval fields without weakening the existing artifact-only fixture contract.
  - [x] Require exact authority family `subscription-agent-launch` and operation `one bounded supervised process-launch operation`.
  - [x] Require exact work item, attempt, route, worker, lane, authority mode, workspace, launch policy, target, command template, argv, cwd, environment allowlist, blocked credential/session paths, artifact limits, output policies, lifecycle policies, verification command, retained evidence, operator, rollback, stop lines, and expiry/review point.
  - [x] Reject expired, future-effective, mismatched, ambiguous, stale, placeholder, or Story 8.5 artifact-only approvals before runtime execution.
- [x] Implement bounded runtime adapter and service binding. (AC: 1, 2, 3, 4)
  - [x] Add a runtime adapter that executes argument arrays only and never shell strings.
  - [x] Gate adapter invocation behind broad subscription launch gate, target-specific gate, exact target/template match, and exact approval binding.
  - [x] Record process lifecycle metadata for started, completed, failed, timed out, and cancelled terminal states.
  - [x] Preserve default disabled/no-launch behavior when gates or approval are missing.
- [x] Preserve metadata-only runtime evidence. (AC: 4, 5)
  - [x] Store approval id/status, target/template ids, timeout/cancellation states, exit status metadata, bounded byte counts, artifact references, and rollback/recovery metadata only.
  - [x] Exclude raw stdout/stderr, generated patches, prompts, completions, provider payloads, credentials, session data, and source snapshots from workflow events.
  - [x] Keep source mutation, provider calls, network expansion, PR delivery, issue sync, cleanup, and failed-check bypass denied.
- [x] Add/adjust tests. (AC: 1, 2, 3, 4, 5)
  - [x] Test no approval means no adapter/process launch even when gates are configured.
  - [x] Test exact approval allows one adapter invocation with metadata-only completed evidence.
  - [x] Test Story 8.5 artifact-only approval reuse is rejected.
  - [x] Test mismatched target/template, unsafe argv/cwd/env, expired approval, or unsafe placeholder stop lines reject before launch.
  - [x] Test failure, timeout, and cancellation evidence remains metadata-only.
- [x] Verify scoped and full checks. (AC: 6)
  - [x] Run focused subscription-agent launch tests.
  - [x] Run `pnpm.cmd run check:process-lifecycle`.
  - [x] Run `pnpm.cmd run check`.

### Review Findings

- [x] [Review][Decision] Approval is self-attested instead of resolved from an accepted approval instance — resolved by requiring `SUPERVISOR_ACCEPTED_SUBSCRIPTION_RUNTIME_APPROVAL_IDS` to contain the approval id and by comparing request fields to the service-derived canonical accepted runtime approval packet.
- [x] [Review][Patch] Runtime executes before duplicate/active attempt checks [services/supervisor/src/supervisor/application/service.py:8711]
- [x] [Review][Patch] Runtime command argv is not bound to an exact approved template argv [services/supervisor/src/supervisor/application/service.py:8933]
- [x] [Review][Patch] Timeout and cancellation values are not exactly validated or enforced [services/supervisor/src/supervisor/application/service.py:8716]
- [x] [Review][Patch] Runtime uses service cwd and artifact-only workspace contract instead of an approved isolated runtime workspace [services/supervisor/src/supervisor/application/service.py:8937]
- [x] [Review][Patch] stdout/stderr are fully buffered in memory despite metadata-only output limits [services/supervisor/src/supervisor/domain/subscription_launch.py:130]
- [x] [Review][Patch] Lifecycle claims exceed enforcement for process tree, cancellation, heartbeat, orphan reconciliation, and cleanup [services/supervisor/src/supervisor/domain/subscription_launch.py:132]
- [x] [Review][Patch] retained evidence and stop lines are checked loosely instead of exact canonical approval content [services/supervisor/src/supervisor/application/service.py:8939]

## Dev Notes

This story starts from the existing subscription-agent launch request path, which currently supports artifact-only fixture evidence and rejection evidence. Do not reuse the Story 8.5 artifact-only fixture approval as process-launch approval. Add a separate exact approval binding for bounded supervised runtime.

### Required First Reads

- `docs/goals/subscription-agent-process-launch-approval-packet-2026-06-13.md`
- `docs/stories/16-1-refresh-subscription-agent-process-launch-approval-packet.md`
- `docs/stories/16-2-pin-subscription-agent-process-launch-packet-to-drift-checks.md`
- `docs/stories/8-5-execute-one-explicitly-approved-artifact-only-subscription-agent-launch.md`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `packages/contracts/src/api.ts`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `services/supervisor/src/supervisor/domain/subscription_launch_adapter.py`

### Existing Runtime Shape

- `SupervisorService.get_subscription_agent_launch_request(...)` computes expected launch evidence from routing preview, target registry, disabled launch adapter workspace/output/lifecycle contracts, and the request payload.
- Accepted Story 8.5 artifact-only fixture paths currently record fixture attempts and metadata-only events without launching a process.
- Rejected launch requests record metadata-only rejection evidence when `recordEvent` is true.
- `SUPERVISOR_ALLOW_SUBSCRIPTION_AGENT_LAUNCH` and target-specific settings default disabled and must remain disabled-by-default.

### Approved Boundary

- Authority family: `subscription-agent-launch`
- Operation: one bounded supervised process-launch operation
- Execution form: argument-array execution only, no shell string execution
- Environment: explicit allowlist only
- Credential/session policy: deny `.env`, `.git`, `.ssh`, cloud credentials, browser profiles, app sessions, and token/secret/credential paths
- Retention: metadata-only workflow events and artifact references
- Rollback: keep or re-disable subscription-agent process launch and return to artifact-only fixture/readiness evidence

### Guardrails

- Do not use shell expansion or command strings.
- Do not inherit arbitrary environment variables.
- Do not read credentials, sessions, browser profiles, Git credentials, SSH keys, cloud credentials, provider credentials, or app session directories.
- Do not call providers or construct provider prompts.
- Do not mutate source, apply generated patches, sync issues, deliver PRs, merge, cleanup, delete branches/worktrees, or bypass failed checks.
- Do not retain raw stdout/stderr, generated patch contents, prompts, completions, provider payloads, credentials, sessions, or full source snapshots in workflow events.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `pnpm.cmd run check:docs` initially hit Windows sandbox pnpm temp-file EPERM; reran outside sandbox and passed.
- `services/supervisor/.venv/Scripts/python.exe -m pytest tests/integration/test_routing_preview.py -q -k subscription_agent_launch` passed with 16 tests from the supervisor package directory.
- `pnpm.cmd run check:process-lifecycle` passed after updating the subscription approval-packet drift checker for Story 16.3's bounded runtime exception.
- `pnpm.cmd run check` passed, including dashboard build and 200 supervisor tests.
- BMAD code review found self-attested approval, duplicate execution, loose argv/cwd/timeout/retention validation, unbounded output buffering, and overclaimed lifecycle controls; all review findings were patched and `pnpm.cmd run check` passed with 202 supervisor tests.

### Completion Notes List

- Added runtime approval fields to subscription-agent launch request contracts.
- Added `SupervisedSubscriptionLaunchAdapter` for argv-only execution with metadata-only terminal result data.
- Added exact runtime approval validation behind broad and target-specific subscription launch gates.
- Kept the existing Story 8.5 artifact-only fixture path separate from runtime execution and rejected artifact-only approval reuse for runtime-shaped requests.
- Recorded runtime execution attempts/events with metadata-only evidence and no raw stdout/stderr, generated patch content, credentials, sessions, provider payloads, prompts, completions, or source snapshots.
- Added focused integration tests for missing approval, exact runtime approval, artifact-only approval reuse, and existing fixture behavior.
- Added a server-side accepted runtime approval id gate, canonical approval packet matching, replay-safe prelaunch idempotency, bounded discard-only output counters, and exact runtime cwd/argv/timeout/evidence/stop-line validation after BMAD review.

### File List

- `docs/stories/16-3-implement-bounded-subscription-agent-supervised-runtime.md`
- `docs/stories/index.md`
- `packages/contracts/src/api.ts`
- `scripts/check-subscription-agent-process-launch-approval-packet.mjs`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/domain/subscription_launch.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

### Change Log

- 2026-06-14: Created Story 16.3 for bounded subscription-agent supervised runtime behind exact process-launch approval binding.
- 2026-06-14: Implemented bounded subscription-agent supervised runtime adapter, exact approval binding, metadata-only runtime evidence, drift checks, and integration tests.
