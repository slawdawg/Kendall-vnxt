# PRD: Subscription Agent Launch Disabled To Supervised Execution

Date: 2026-06-08
Status: draft, not approved for implementation
Scope: Future direct subscription-agent launch under supervised execution controls

## Summary

This PRD defines the requirements for a future transition from disabled subscription-agent launch stubs to supervised subscription-agent process execution.

It does not approve implementation. Direct launch of Codex, Claude, Gemini, Antigravity, or any other subscription-agent process remains disabled until this PRD or a successor decision record is explicitly approved and converted into implementation stories.

## Source Artifacts

- `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md`
- `docs/architecture/kendall-vnxt-queue-attempt-boundary-and-provider-proofs-2026-06-08.md`
- `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`
- `docs/architecture/kendall-vnxt-dashboard-command-boundary-2026-06-08.md`
- `docs/stories/1-20-disabled-subscription-agent-launch-stub.md`
- `docs/stories/2-1-execution-attempt-contract-and-state-model.md`
- `docs/stories/2-3-approval-binding-and-stale-decision-rejection.md`
- `docs/stories/2-4-workspace-isolation-plan-contract.md`
- `docs/stories/3-9-process-lifecycle-design-and-runtime-export-polish.md`

## Problem

Kendall_vNxt can create subscription handoff packages and disabled launch stubs, but it cannot directly supervise an external subscription-agent process.

That is the correct current posture. Before launch can be considered, the product needs explicit requirements for process supervision, approval binding, workspace materialization, output capture, cancellation, timeout, session boundaries, rollback, dashboard copy, and evidence export.

## Goals

- Define the minimum supervised launch contract.
- Keep launch attached to `ExecutionAttempt`, not `QueueLease`.
- Require exact approval binding before launch.
- Preserve isolated workspace and artifact evidence.
- Provide cancellation, timeout, cleanup, and rollback requirements.
- Keep secrets and subscription sessions outside prompts, logs, and artifacts by default.
- Make all launch evidence reviewable from dashboard and runtime exports.

## Non-Goals

- Do not implement process launch in this PRD.
- Do not add a launcher, command runner, or process supervisor.
- Do not call local or remote model/provider endpoints.
- Do not enable source mutation.
- Do not grant credential access.
- Do not add background runtime assistant behavior.
- Do not bypass subscription handoff packages or operator review.

## Proposed Capability

Future implementation may allow the supervisor to launch a single approved subscription-agent command for a specific execution attempt.

Initial scope, after approval only:

- one work item,
- one execution attempt,
- one approved agent target,
- one materialized workspace,
- bounded stdout/stderr capture,
- explicit timeout and cancellation,
- no credential files or raw secrets mounted by default,
- artifact references instead of raw output in workflow events.

## Required Gates Before Implementation

1. Approve this PRD or a successor decision record.
2. Define allowed agent targets and command templates.
3. Define workspace materialization and cleanup behavior.
4. Define approval binding and expiry.
5. Define session/auth boundary and forbidden credential inheritance.
6. Define stdout/stderr capture limits and redaction.
7. Define timeout, cancellation, orphan cleanup, and terminal-state reconciliation.
8. Define dashboard copy and controls.
9. Define runtime evidence export additions.
10. Define rollback/global-disable procedure.

## Approval Binding

Launch approval must bind:

- work item id,
- execution attempt id,
- route decision id,
- worker id,
- lane,
- authority mode,
- workspace plan id,
- launch policy id,
- agent target,
- command template id,
- approval actor,
- approval timestamp,
- approval expiry.

Any mismatch must reject launch and record a non-executing event.

## Process Lifecycle Requirements

The process lifecycle must use execution attempt states:

- `planned`,
- `approved`,
- `starting`,
- `running`,
- `cancel_requested`,
- `cancelled`,
- `timed_out`,
- `failed`,
- `completed`.

Required evidence:

- process supervisor id,
- process start timestamp,
- heartbeat timestamp,
- exit code,
- terminal timestamp,
- timeout/cancellation reason when present,
- artifact references,
- cleanup result.

## Workspace Requirements

Each launch needs a per-attempt workspace:

- source snapshot strategy,
- read roots,
- write roots,
- artifact root,
- forbidden paths,
- diff capture,
- cleanup rule,
- rollback rule.

Future source mutation requires a separate approval. The first launch implementation should prefer artifact-only or patch-only output.

## Output And Artifact Requirements

Workflow events must not embed raw process output.

Allowed event evidence:

- output byte counts,
- redaction status,
- truncation status,
- artifact references,
- exit code,
- failure class,
- timeout/cancellation state.

Artifact retention must be bounded and redacted before display.

## Session And Secret Boundary

Direct launch must not inherit arbitrary user credentials or session state.

Required controls:

- explicit environment allowlist,
- blocked credential path list,
- no raw secret values in prompts, logs, events, or artifacts,
- no default access to `.env`, `.ssh`, credential stores, tokens, or browser/session stores,
- operator-approved session scope if a future agent requires authentication,
- revocation and disable procedure.

## Dashboard Requirements

Dashboard must distinguish:

- launch disabled,
- launch stub available,
- launch approved but not started,
- launch starting,
- launch running,
- cancellation requested,
- terminal result.

Dashboard controls must remain unavailable until all required gates and approvals are satisfied.

## Runtime Evidence Export Requirements

Runtime exports should include:

- launch approval binding,
- process lifecycle summary,
- workspace materialization summary,
- output artifact references,
- safety flags,
- cancellation/timeout/rollback evidence,
- related supervisor reports.

## Acceptance Criteria For Future Implementation

1. Subscription-agent launch remains disabled by default.
2. Launch requires explicit setting, launch policy, and approval binding.
3. Queue leases do not gain process launch fields or authority.
4. Execution attempts carry process lifecycle evidence.
5. Workspace materialization is per-attempt and recoverable.
6. Output capture is bounded, redacted, and artifact-referenced.
7. Cancellation and timeout produce terminal attempt states.
8. Session/secret boundaries are enforced by tests.
9. Dashboard copy and controls show exact launch state.
10. Runtime evidence exports include launch evidence without raw secrets or unbounded output.
11. Rollback disables launch and preserves prior evidence.

## Rollback

Rollback must include:

- global setting to disable launch,
- registry health returning to disabled,
- dashboard showing disabled reason,
- active process cancellation/cleanup procedure,
- artifact retention policy for interrupted launches,
- attempts rejecting new launch requests,
- runtime evidence exports retaining summaries without raw secret or session data.

## Open Questions

- Which subscription-agent targets are eligible for the first supervised launch?
- Should the first implementation produce patch artifacts only, with source mutation still operator-applied?
- What is the maximum retained stdout/stderr artifact size?
- What environment variables, if any, can be inherited?
- Should approvals expire by time only, or also when route/workspace evidence changes?
