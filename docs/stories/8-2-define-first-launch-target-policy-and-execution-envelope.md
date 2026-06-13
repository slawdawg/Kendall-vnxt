---
baseline_commit: 84465778a690822cbefc63dd4c5d6a81bfab9fb8
---

# Story 8.2: Define First Launch Target Policy And Execution Envelope

Date: 2026-06-12
Status: done

## Story

As Bob,
I want the first subscription-agent launch target, command template, environment allowlist, output limits, timeout/cancel policy, expiry policy, dashboard controls, rollback, and verification command defined explicitly,
so that any future real launch is narrow, reviewable, and non-stale.

## Acceptance Criteria

1. Given a candidate subscription-agent target is selected, when Kendall evaluates the launch policy, then the policy names the target id, command template id, allowed environment variables, blocked credential/session paths, artifact limits, timeout and cancellation values, approval expiry, dashboard controls, rollback action, and verification command, and any missing field blocks launch readiness.
2. Given target, command, workspace, route decision, worker, lane, authority mode, approval actor/timestamp, environment allowlist, blocked paths, artifact policy, timeout/cancel values, orphan handling, terminal reconciliation, cleanup policy, dashboard controls, rollback, verification command, or allowed output mode changes, when Kendall re-evaluates the policy, then prior approval is stale and the blocked reason identifies the changed field.
3. Given the policy is incomplete or rejected, when the launch envelope is rendered, then the result is readiness-only, records stable blocked reasons, and does not imply that real process launch is approved.
4. Given the policy defines artifact-only or patch-only output, when source mutation is considered, then source mutation remains denied unless a later explicit source-mutation approval exists.
5. This story remains non-executing for subscription-agent launch authority: it may add policy artifacts and tests, but it must not start a real subscription-agent process, run worker shell commands, call providers, inherit credentials or sessions, mutate issues, perform PR/merge/cleanup actions, or grant broad autonomy.

## Tasks / Subtasks

- [x] Define the first launch target policy artifact. (AC: 1, 3, 4, 5)
  - [x] Add a durable policy document under `docs/goals/` using the naming pattern `epic-8-first-subscription-launch-policy-YYYY-MM-DD.md`.
  - [x] Declare the target status as `candidate`, `not-approved`, or `approved-for-dry-run-only`; do not mark real launch approved.
  - [x] Include target id, command template id, output mode, dashboard posture, rollback posture, and verification command placeholders or explicit blocked values.
- [x] Define the exact launch envelope fields and stale invalidators. (AC: 1, 2, 3)
  - [x] Include every required field from the Story 8.1 approval packet: work item id, execution attempt id, route decision id, worker id, lane, authority mode, workspace plan id, launch policy id, target id, command template id, approval actor, approval timestamp, environment allowlist, blocked credential/session paths, artifact limits, redaction/truncation behavior, timeout values, orphan detection, terminal reconciliation, idempotent cleanup, approval expiry, dashboard controls, rollback/global disable, verification command, and allowed output mode.
  - [x] Define stale behavior for missing, mismatched, expired, or changed fields.
  - [x] Provide stable blocked reason identifiers for each missing or stale field.
- [x] Preserve safety boundaries and deny broad authority. (AC: 3, 4, 5)
  - [x] State that Stories 8.1-8.4 remain non-executing for real subscription-agent process launch.
  - [x] State that Story 8.5 or a successor story must obtain a later exact approval packet before any real launch.
  - [x] Keep source mutation, provider/model calls, credential/session inheritance, network expansion, issue sync, PR/merge/cleanup execution, Claude launch, failed-check bypass, and broad autonomy denied.
- [x] Add machine-checkable policy evidence. (AC: 1, 2, 3)
  - [x] Add a table or checklist with launch envelope field, configured value, readiness status, stale invalidator, and blocked reason.
  - [x] Distinguish configured values from intentionally blocked or not-yet-approved values.
  - [x] Ensure the policy can be consumed by Story 8.3 without requiring chat context.
- [x] Update story evidence. (AC: 1-5)
  - [x] Record implementation notes in this story file.
  - [x] Record verification commands and results.

### Review Findings

- [x] [Review][Patch] Update story index text so Story 8.2 is no longer described as a placeholder [docs/stories/index.md:182]
- [x] [Review][Patch] Add permission envelope and explicit output policy to the launch envelope and stale invalidators [docs/goals/epic-8-first-subscription-launch-policy-2026-06-12.md:56]
- [x] [Review][Patch] Clarify approval timestamp semantics so later approvals do not self-invalidate [docs/goals/epic-8-first-subscription-launch-policy-2026-06-12.md:68]
- [x] [Review][Patch] Clarify command template policy as inert/non-executable until later exact approval [docs/goals/epic-8-first-subscription-launch-policy-2026-06-12.md:19]
- [x] [Review][Patch] Specify stale approval consequences: block launch, require new exact approval, invalidate dashboard controls, preserve evidence [docs/goals/epic-8-first-subscription-launch-policy-2026-06-12.md:90]
- [x] [Review][Patch] Add heartbeat policy and child process tree tracking to lifecycle envelope [docs/goals/epic-8-first-subscription-launch-policy-2026-06-12.md:76]

## Dev Notes

### Product Intent

Story 8.2 turns the Story 8.1 approval packet into a concrete launch policy envelope. The value is clarity: Bob should be able to see exactly what is missing before any real subscription-agent launch can be considered.

This story is not the launch. It is the policy and envelope story that later dry-run and real-launch stories consume.

### Prior Story Intelligence

- `docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md`
  - Story 8.1 keeps subscription-agent process launch blocked.
  - It names the exact launch envelope required before Story 8.5 may request real launch approval.
  - Review fixes added approval actor/timestamp, full stale invalidators, timeout/expiry/verification blocker rows, orphan detection, terminal-state reconciliation, and idempotent cleanup requirements.
- `docs/stories/8-1-refresh-subscription-agent-launch-approval-packet-from-epic-7-evidence.md`
  - Current status: done.
  - Story 8.2 should implement the next safe action from the packet, not bypass it.

### Existing Source Material To Reuse

- `docs/stories/5-1-subscription-launch-settings-policy-and-target-registry.md`
  - Disabled-default launch settings and target registry entries for approved launch targets only.
  - All targets stay disabled unless a target-specific policy and setting are approved.
- `docs/stories/5-2-subscription-launch-approval-binding-and-stale-rejection.md`
  - Launch approval payload fields: work item, attempt, route decision, worker, lane, authority mode, workspace plan, launch policy, target, command template, actor, timestamp, and expiry.
  - Missing, mismatched, expired, or evidence-changed approval must reject.
- `docs/stories/5-3-subscription-launch-workspace-output-and-session-contract.md`
  - Per-attempt workspace metadata, artifact-only or patch-only first implementation, blocked credential/session paths, explicit environment allowlist, stdout/stderr limits, redaction, truncation, and retention metadata.
- `docs/stories/5-4-subscription-launch-supervisor-lifecycle-disabled-adapter.md`
  - Disabled adapter lifecycle evidence, timeout, cancellation, cleanup, and terminal-state evidence without real OS process launch.
- `docs/stories/5-5-subscription-launch-supervised-process-behind-approval.md`
  - Deferred launch story; do not implement directly.

### Architecture Guardrails

- `docs/prds/subscription-agent-launch-disabled-to-supervised-execution.md`
  - Status is draft/reviewed/not approved for implementation.
  - Launch requires explicit setting, launch policy, and approval binding.
  - Queue leases must not gain process launch fields or authority.
  - Runtime evidence must include launch evidence without raw secrets or unbounded output.
- `docs/prds/subscription-agent-launch-prd-review-2026-06-08.md`
  - No concrete launch target is approved.
  - First implementation should be artifact-only or patch-only.
  - No arbitrary environment inheritance is approved.
  - Approvals must expire by time and evidence changes.
- `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md`
  - Process execution attaches to `ExecutionAttempt`, not `QueueLease`.
  - Future process launch requires startup timeout, run timeout, cancellation timeout, heartbeat, terminal reconciliation, orphan detection, and idempotent cleanup.
- `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`
  - Real worker/provider execution remains blocked by default.
  - Credential access, arbitrary commands, provider/model calls, source mutation, network access, and broad snapshot export remain denied.
- `docs/architecture/kendall-vnxt-dashboard-command-boundary-2026-06-08.md`
  - Subscription-agent launch is currently execution-prohibited display.
  - Dashboard controls must not imply real process launch before backend authority exists.

### Implementation Guidance

- Prefer a durable policy artifact over code changes for this story unless a minimal validation/check artifact is already established by local patterns.
- Do not add command templates that are executable by Kendall. If a command template shape is needed, express it as a non-executing policy field with `not-approved` status.
- Do not choose a real target unless Bob explicitly approves the target in this story. Without explicit approval, use a candidate placeholder and keep readiness blocked.
- The launch envelope should fail closed. Missing values are blocked, not defaults.
- Stable blocked reason ids should be snake_case and operator-readable.
- Avoid wording such as "ready to launch" unless every required field is approved. Prefer "ready for dry-run policy review" or "blocked pending exact launch approval."

### Testing

- Documentation/story artifact checks:
  - `pnpm.cmd run check:docs`
- Broader verification if generated indexes, report catalogs, or checked policy docs are touched:
  - `pnpm.cmd run check`
- No live subscription-agent process, provider, network, credential, GitHub mutation, PR/merge/cleanup, or source-mutation verification is allowed for this story.

### References

- `docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md`
- `docs/stories/8-1-refresh-subscription-agent-launch-approval-packet-from-epic-7-evidence.md`
- `docs/stories/5-1-subscription-launch-settings-policy-and-target-registry.md`
- `docs/stories/5-2-subscription-launch-approval-binding-and-stale-rejection.md`
- `docs/stories/5-3-subscription-launch-workspace-output-and-session-contract.md`
- `docs/stories/5-4-subscription-launch-supervisor-lifecycle-disabled-adapter.md`
- `docs/stories/5-5-subscription-launch-supervised-process-behind-approval.md`
- `docs/prds/subscription-agent-launch-disabled-to-supervised-execution.md`
- `docs/prds/subscription-agent-launch-prd-review-2026-06-08.md`
- `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md`
- `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`
- `docs/architecture/kendall-vnxt-dashboard-command-boundary-2026-06-08.md`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Focused docs verification: `pnpm.cmd run check:docs` passed.
- Full verification: `pnpm.cmd run check` passed, including documentation drift checks, dashboard production build, and 153 supervisor integration tests with 1 existing aiosqlite deprecation warning.
- Review-fix full verification: `pnpm.cmd run check` failed inside the restricted sandbox when Next.js could not fetch Google Fonts for the dashboard build.
- Review-fix full verification rerun outside the restricted sandbox: `pnpm.cmd run check` passed, including dashboard production build and 153 supervisor integration tests with 1 existing aiosqlite deprecation warning.

### Completion Notes List

- Created `docs/goals/epic-8-first-subscription-launch-policy-2026-06-12.md` as a non-executing launch policy artifact.
- Defined the first launch target posture as `not-approved` and launch readiness as `blocked_pending_exact_launch_approval`.
- Added candidate target policy fields, exact launch envelope fields, stale invalidators, and stable blocked reasons.
- Preserved the real-launch stop line: no process launch, executable command template, worker shell command, source mutation, provider/model call, credential/session inheritance, network expansion, issue sync, PR/merge/cleanup execution, Claude launch, failed-check bypass, or broad autonomy is approved.
- Updated `docs/stories/index.md` to point Story 8.2 at the created story file.
- Resolved code-review findings by updating the Epic 8 index state, adding permission envelope and output policy fields, clarifying approval timestamp validity, keeping command templates inert until exact approval, adding stale-approval consequences, and adding heartbeat plus child-process tracking policies.

### File List

- `docs/goals/epic-8-first-subscription-launch-policy-2026-06-12.md`
- `docs/stories/8-2-define-first-launch-target-policy-and-execution-envelope.md`
- `docs/stories/index.md`

## Change Log

- 2026-06-12: Implemented Story 8.2 first launch policy artifact, stale invalidator matrix, blocked reason evidence, docs verification, and full project verification; status moved to review.
- 2026-06-12: Addressed Story 8.2 code-review findings, reran full verification outside the restricted sandbox after a Google Fonts fetch failure, and marked the story done.
