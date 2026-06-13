# Epic 8 First Subscription-Agent Launch Policy

Date: 2026-06-12
Status: launch policy defined; real process launch not approved

## Purpose

Define the first subscription-agent launch policy and execution envelope required before Kendall may later request approval for one artifact-only or patch-only subscription-agent process launch.

This policy does not approve real process launch.

## Current Launch Posture

Target status: `not-approved`

Launch readiness: `blocked_pending_exact_launch_approval`

Allowed by this policy:

- readiness-only policy review,
- disabled or dry-run adapter preparation in later stories,
- dashboard display of blocked or missing launch inputs,
- verification of policy completeness.

Still denied:

- real subscription-agent process launch,
- executable command templates approved for runtime use,
- worker shell command execution,
- source mutation,
- provider/model calls,
- network expansion,
- credential or session inheritance,
- issue sync,
- PR creation/update, merge, branch/worktree deletion, or cleanup execution,
- Claude launch,
- failed-check bypass,
- broad autonomy.

## Candidate Target Policy

| Field | Value | Readiness status | Stale invalidator | Blocked reason |
| --- | --- | --- | --- | --- |
| launch target id | `not-approved` | blocked | target id changes or remains missing | `missing_subscription_launch_target` |
| command template id | `not-approved` | blocked | command template id changes or remains missing | `missing_subscription_command_template` |
| command template execution status | `inert-policy-field-only` | blocked | command template execution status changes | `subscription_command_template_not_executable` |
| target status | `not-approved` | blocked | target approval status changes or remains missing | `subscription_launch_target_not_approved` |
| allowed output mode | `artifact-only-or-patch-only-required` | blocked until exact approval chooses one mode | output mode changes or remains ambiguous | `missing_subscription_launch_output_mode` |
| dashboard posture | `execution-prohibited-display` | blocked | dashboard control posture changes | `subscription_launch_dashboard_execution_prohibited` |
| rollback posture | `global-disable-required` | blocked | rollback procedure changes or remains missing | `missing_launch_rollback_policy` |
| approved verification command | `not-approved` | blocked | verification command changes or remains missing | `missing_subscription_launch_verification_command` |

## Exact Launch Envelope

Every field below must be present, current, and approved before a later story may request real process launch.

| Launch envelope field | Configured value | Readiness status | Stale invalidator | Blocked reason |
| --- | --- | --- | --- | --- |
| work item id | `not-selected` | blocked | work item id changes or remains missing | `missing_work_item_id` |
| execution attempt id | `not-selected` | blocked | attempt id changes or remains missing | `missing_execution_attempt_id` |
| route decision id | `not-selected` | blocked | route decision id changes or remains missing | `missing_route_decision_id` |
| worker id | `not-selected` | blocked | worker id changes or remains missing | `missing_worker_id` |
| lane | `subscription_agent_launch_candidate` | blocked until exact approval binds lane | lane changes or remains unbound | `missing_or_unapproved_lane` |
| authority mode | `supervised_subscription_launch_candidate` | blocked until exact approval binds authority mode | authority mode changes or remains unbound | `missing_or_unapproved_authority_mode` |
| workspace plan id | `not-approved` | blocked | workspace plan id changes or remains missing | `missing_workspace_plan_id` |
| launch policy id | `epic-8-first-subscription-launch-policy-v1` | configured | launch policy id changes | `launch_policy_changed` |
| launch target id | `not-approved` | blocked | target id changes or remains missing | `missing_subscription_launch_target` |
| command template id | `not-approved` | blocked | command template id changes or remains missing | `missing_subscription_command_template` |
| command template execution status | `inert-policy-field-only` | blocked | execution status changes or becomes executable before exact approval | `subscription_command_template_not_executable` |
| approval actor | `not-approved` | blocked | approval actor changes or remains missing | `missing_approval_actor` |
| approval timestamp | `not-approved` | blocked | approved timestamp is missing, predates an invalidating evidence change, or is outside the approved expiry window | `missing_or_stale_approval_timestamp` |
| permission envelope | `not-approved` | blocked | permission envelope changes or remains missing | `missing_permission_envelope` |
| environment allowlist | `empty` | blocked | allowlist changes or remains empty | `missing_environment_allowlist` |
| blocked credential/session paths | `.env`, `.ssh`, credential stores, tokens, browser/session stores, shell profiles | configured | blocked path list changes | `credential_session_boundary_changed` |
| artifact size limits | `not-approved` | blocked | artifact size limits change or remain missing | `missing_artifact_size_limits` |
| artifact retention limits | `not-approved` | blocked | retention limits change or remain missing | `missing_artifact_retention_limits` |
| redaction behavior | `required-not-configured` | blocked | redaction behavior changes or remains missing | `missing_output_redaction_policy` |
| truncation behavior | `required-not-configured` | blocked | truncation behavior changes or remains missing | `missing_output_truncation_policy` |
| output policy | `not-approved` | blocked | output policy changes or remains missing | `missing_output_policy` |
| startup timeout | `not-approved` | blocked | startup timeout changes or remains missing | `missing_startup_timeout` |
| run timeout | `not-approved` | blocked | run timeout changes or remains missing | `missing_run_timeout` |
| cancellation timeout | `not-approved` | blocked | cancellation timeout changes or remains missing | `missing_cancellation_timeout` |
| heartbeat policy | `required-not-configured` | blocked | heartbeat policy changes or remains missing | `missing_heartbeat_policy` |
| child process tree tracking policy | `required-not-configured` | blocked | child process tracking changes or remains missing | `missing_child_process_tree_tracking_policy` |
| orphan detection policy | `required-not-configured` | blocked | orphan detection changes or remains missing | `missing_orphan_detection_policy` |
| terminal-state reconciliation policy | `required-not-configured` | blocked | reconciliation policy changes or remains missing | `missing_terminal_reconciliation_policy` |
| idempotent cleanup policy | `required-not-configured` | blocked | cleanup policy changes or remains missing | `missing_idempotent_cleanup_policy` |
| approval expiry policy | `not-approved` | blocked | expiry policy changes or remains missing | `missing_approval_expiry_policy` |
| dashboard controls and copy | `blocked-state-display-only` | blocked | dashboard control copy changes | `dashboard_controls_not_launch_enabled` |
| rollback/global-disable procedure | `not-approved` | blocked | rollback procedure changes or remains missing | `missing_launch_rollback_policy` |
| approved verification command | `not-approved` | blocked | verification command changes or remains missing | `missing_subscription_launch_verification_command` |
| allowed output mode | `artifact-only-or-patch-only-required` | blocked | output mode changes or remains ambiguous | `missing_subscription_launch_output_mode` |

## Stale Approval Rules

Approval is absent until Bob approves an exact launch envelope in a later story.

If approval exists later, it must become stale when any envelope field is missing, mismatched, expired, or changed. This includes work item, attempt, route decision, worker, lane, authority mode, workspace plan, launch policy, target, command template id, command template execution status, approval actor, approval timestamp validity, permission envelope, environment allowlist, blocked credential/session paths, artifact policy, output policy, redaction/truncation behavior, timeout values, heartbeat policy, child process tree tracking policy, orphan detection, terminal reconciliation, cleanup policy, expiry, dashboard controls, rollback, verification command, or output mode.

Stale approval consequence: launch remains blocked, dashboard launch controls remain disabled, the prior approval must not be reused, a new exact approval packet is required, and retained evidence must record the stale field and the next safe action.

Stale result: `subscription_launch_approval_stale`

Missing result: `subscription_launch_approval_missing`

Rejected result: `subscription_launch_approval_rejected`

## Source Mutation Policy

Source mutation remains denied.

The first launch candidate may only be considered for artifact-only or patch-only output. Generated patches must be retained as artifacts for operator review; Kendall must not apply them unless a later explicit source-mutation approval exists.

## Dry-Run Handoff To Story 8.3

Story 8.3 may consume this policy to implement disabled or dry-run evidence only.

Required dry-run behavior:

- no OS process launch,
- no command template executable by Kendall,
- no inherited environment beyond explicit allowlist evidence,
- no credential/session access,
- no provider/model/network calls,
- bounded artifact references only,
- lifecycle evidence that clearly says disabled or dry-run,
- blocked readiness when any envelope field above is missing.

## Real Launch Stop Line

No real subscription-agent process launch is approved by this policy.

Story 8.5 or a successor story may request real launch approval only after the exact launch envelope is complete and Bob accepts it. If any field remains missing, stale, or rejected, the correct state is readiness-only and blocked.
