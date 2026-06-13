# Epic 8 Subscription-Agent Launch Approval Packet

Date: 2026-06-12
Status: accepted for Story 8.5 artifact-only fixture path; production subscription CLI launch remains denied

## Purpose

Refresh the deferred subscription-agent launch approval packet after Epic 7 proved supervised Codex execution gates. This packet identifies which Epic 7 controls can be reused, which Story 5.5 gates remain unresolved, and what exact approvals are still required before any real subscription-agent process launch.

This packet approves only the Story 8.5 artifact-only fixture path accepted by Bob on 2026-06-12. It does not approve production subscription CLI launch or any broader authority.

## Current Decision

Subscription-agent fixture launch path is approved only for the exact Story 8.5 artifact-only envelope below.

Allowed by this packet:

- planning,
- readiness evaluation,
- approval packet refinement,
- disabled or dry-run evidence in later stories,
- dashboard display of blocked or missing approval state.

Still denied:

- production subscription-agent process launch,
- shell command execution,
- source mutation,
- provider/model calls,
- network expansion,
- credential or session inheritance,
- issue sync,
- PR creation/update, merge, branch/worktree deletion, or cleanup execution,
- Claude launch,
- failed-check bypass,
- broad autonomy.

## Epic 7 Evidence Reuse

| Epic 7 control | Reusable for Epic 8 | How it applies | Status |
| --- | --- | --- | --- |
| Green-gate readiness contract | Yes | Use staged checks with stable blocked reasons and machine-readable evidence. | available |
| Bounded launch contract | Yes | Bind approval to exact work item, attempt, route decision, worker, lane, authority mode, workspace plan, permission envelope, and expiry. | available |
| Out-of-scope diff guard | Yes | Preserve approved path/scope checks before any artifact or patch can become delivery-eligible. | available |
| Supervised Codex launch evidence | Partially | Reuse lifecycle and stop-line patterns, but do not treat Codex launch approval as subscription-agent approval. | available as precedent |
| Verification evidence | Yes | Require approved verification command and latest-attempt verification evidence before green readiness. | available |
| Dev Console readiness view | Yes | Show real persisted evidence, missing approvals, stale state, and next safe action. | available |
| PR/merge/cleanup eligibility | Yes | Keep eligibility reporting separate from action execution. | available |
| Latest-attempt evidence binding | Yes | Reject stale verification or launch evidence from older attempts. | required |

## Story 5.5 Gate Mapping

| Story 5.5 gate | Current evidence | Epic 8 owner story | Current status | Missing approval or blocker |
| --- | --- | --- | --- | --- |
| Approved target and command template | PRD says no concrete target is approved. | 8.2 | blocked | `missing_subscription_launch_target_and_command_template` |
| Exact non-stale approval binding | Epic 7 provides reusable stale rejection pattern. | 8.2 | planned | `missing_subscription_launch_approval_envelope` |
| Isolated per-attempt workspace | Existing architecture defines required workspace fields. | 8.2, 8.3 | planned | `missing_subscription_launch_workspace_policy` |
| Environment allowlist and credential/session denials | PRD review forbids arbitrary environment inheritance. | 8.2 | blocked | `missing_environment_allowlist_and_session_denial_policy` |
| Bounded redacted output artifacts | Process lifecycle design defines bounded artifact requirements. | 8.2, 8.3 | planned | `missing_output_artifact_limits_and_redaction_policy` |
| Startup, run, cancellation timeout policy | Process lifecycle design requires startup, run, and cancellation timeouts before launch. | 8.2 | blocked | `missing_subscription_launch_timeout_policy` |
| Approval expiry policy | PRD review requires approvals to expire by time and by evidence changes. | 8.2 | blocked | `missing_subscription_launch_approval_expiry_policy` |
| Approved verification command | Epic 7 provides verification evidence patterns, but no subscription-agent verification command is approved. | 8.2 | blocked | `missing_subscription_launch_verification_command` |
| Attempt lifecycle states | Architecture requires `ExecutionAttempt` lifecycle evidence. | 8.3 | planned | `missing_dry_run_lifecycle_evidence` |
| Orphan detection, terminal reconciliation, and idempotent cleanup | Process lifecycle design requires orphan detection, explicit terminal-state reconciliation, and idempotent cleanup. | 8.2, 8.3, 8.6 | blocked | `missing_orphan_reconciliation_and_idempotent_cleanup_policy` |
| Dashboard launch state and disabled authorities | Dashboard command boundary supports execution-prohibited display only. | 8.4 | planned | `missing_subscription_launch_readiness_panel` |
| Runtime evidence export launch summaries | Runtime export shape needs launch evidence references only. | 8.6 | planned | `missing_launch_evidence_export_summary` |
| Rollback disables launch and rejects new attempts | PRD requires rollback/global-disable procedure. | 8.2, 8.6 | blocked | `missing_launch_rollback_policy` |
| Tests for disabled, approved, cancellation, timeout, output, session denial, rollback | No Epic 8 tests exist yet. | 8.3, 8.5, 8.6 | blocked | `missing_subscription_launch_guardrail_tests` |

## Required Exact Approval Before Real Launch

Before Story 8.5 may launch one real subscription-agent process, Bob must approve an exact launch envelope naming:

- work item id,
- execution attempt id,
- route decision id,
- worker id,
- lane,
- authority mode,
- workspace plan id,
- launch policy id,
- launch target id,
- command template id,
- approval actor,
- approval timestamp,
- environment allowlist,
- blocked credential/session paths,
- artifact size and retention limits,
- redaction and truncation behavior,
- startup, run, and cancellation timeout values,
- orphan detection policy,
- terminal-state reconciliation policy,
- idempotent cleanup policy,
- approval expiry policy,
- dashboard controls and copy,
- rollback/global-disable procedure,
- approved verification command,
- allowed output mode: artifact-only or patch-only.

Any missing or changed launch envelope field must make approval absent or stale. Invalidators include work item id, execution attempt id, route decision id, worker id, lane, authority mode, workspace plan id, launch policy id, target id, command template id, approval actor, approval timestamp, environment allowlist, blocked credential/session paths, artifact limits, redaction/truncation behavior, startup/run/cancellation timeout values, orphan detection policy, terminal-state reconciliation policy, idempotent cleanup policy, approval expiry, dashboard controls, rollback/global-disable procedure, verification command, allowed output mode, permission envelope, or output policy.

## Epic 8 Story Sequence

1. Story 8.1 refreshes this packet and keeps launch blocked.
2. Story 8.2 defines the exact first launch target policy and execution envelope.
3. Story 8.3 implements disabled or dry-run adapter evidence without real process launch.
4. Story 8.4 shows subscription launch readiness and blocked state in Dev Console.
5. Story 8.5 is the first story that may request exact approval for one artifact-only or patch-only subscription-agent launch; it must still remain blocked unless that later approval is accepted.
6. Story 8.6 records verification, recovery, and rollback evidence.

## Stop Line

Stories 8.1 through 8.4 do not authorize real subscription-agent process launch.

No Epic 8 story may launch a real subscription-agent process unless a later accepted approval packet names the exact launch envelope listed above. Story 8.5 is only the earliest planned candidate for requesting that approval; it remains blocked if the exact envelope is missing, stale, or rejected.

## Story 8.5 Accepted Exact Approval Packet

Status: accepted by Bob for artifact-only fixture path.

This packet is the accepted approval envelope for Story 8.5 implementation and review. It is intentionally bounded to one artifact-only fixture launch path and keeps broad automation, credential access, network expansion, source mutation, issue sync, PR operations, merge, cleanup, failed-check bypass, provider/model calls, Claude launch, production subscription CLI launch, and broad autonomy denied.

### Acceptance Evidence

| Field | Value |
| --- | --- |
| approval actor | `Bob` |
| approval timestamp | `2026-06-12T16:20:33.2776334-05:00` |
| approval expiry | `2026-06-12T16:50:33.2776334-05:00` |
| accepted statement | `I approve the Story 8.5 exact subscription-agent launch approval packet for the artifact-only fixture path only.` |
| accepted authority family | `subscription-agent launch` |
| accepted operation | implement and verify exactly one approval-bound artifact-only fixture launch-starting path |
| accepted output mode | `artifact-only` |
| accepted verification command | `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k subscription_agent_launch` |

### Authority Family

`subscription-agent launch`

### Operation

Start exactly one subscription-agent process only after the supervisor validates every field in this exact envelope and records a launch-starting `ExecutionAttempt`.

### Scope

The approved launch scope must be bound at request time to one current envelope:

| Field | Approved value |
| --- | --- |
| work item id | exact work item id from the launch request; must match retained readiness evidence |
| execution attempt id | exact attempt id from the launch request; must not already have an active launch |
| route decision id | exact route decision id from the launch request; must match latest route evidence |
| worker id | `subscription.agent.disabled` until a separately enabled subscription target exists |
| lane | `subscription_agent` |
| authority mode | `operator_approval_required` |
| workspace plan id | exact `subscription-workspace-plan-{attempt_id}` from retained readiness evidence |
| launch policy id | `epic-8-first-subscription-launch-policy-v1` |
| target id | `codex.subscription.disabled` for Story 8.5 test/fixture implementation only |
| command template id | `codex-subscription-cli-template-disabled-v1` until a separately enabled template is approved |
| command template execution status | `executable_by_kendall` only for the safe Story 8.5 fixture path; production subscription CLI remains not executable |
| permission envelope | `approved_for_one_artifact_only_subscription_launch` |
| allowed output mode | `artifact-only` |

### Safety Envelope

| Field | Approved value |
| --- | --- |
| environment allowlist | `PATH` only |
| blocked credential/session paths | `.env`, `.env.*`, `.git`, `.ssh`, `.aws`, `.azure`, `.config/gh`, `.docker`, `AppData/Roaming/Claude`, `AppData/Roaming/Codex`, `AppData/Roaming/npm`, `AppData/Local/Google/Chrome/User Data`, `AppData/Local/Microsoft/Edge/User Data`, `services/supervisor/.venv`, `**/*secret*`, `**/*credential*`, `**/*token*` |
| artifact limits | raw output bytes `0`; artifact references only; source mutation false |
| redaction policy | `required` |
| truncation policy | `truncate_to_approved_artifact_limits` |
| output policy | `artifact_references_only_no_raw_output` |
| startup timeout | `10` seconds |
| run timeout | `30` seconds |
| cancellation timeout | `5` seconds |
| heartbeat policy | `heartbeat_metadata_only_no_process_polling` |
| child process tree tracking policy | `no_child_process_tree_created_tracking_metadata_only` |
| orphan detection policy | `orphan_detection_records_no_process_tree_to_scan` |
| terminal reconciliation policy | `terminal_reconciliation_metadata_only_without_process_status` |
| idempotent cleanup policy | `cleanup_is_metadata_only_and_idempotent_without_deletion` |
| dashboard controls | `approval_bound_disabled_until_all_gates_green` |
| rollback policy | `rollback_records_global_disable_without_resource_deletion` |

### Evidence Requirements

| Field | Approved value |
| --- | --- |
| approval actor | `Bob` |
| approval timestamp | exact timestamp of Bob's accepted approval message |
| approval expiry | approval timestamp plus 30 minutes unless Bob supplies a shorter expiry |
| verification command | `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k subscription_agent_launch` |
| workflow event retention | metadata only; no raw stdout, raw stderr, generated patch content, prompts, completions, provider payloads, secrets, source snapshots, or credential/session material |

### Stop Lines

Stop before process start if any envelope field is missing, mismatched, stale, expired, unsupported, or names a target/template that is not enabled for the Story 8.5 fixture path.

Stop before source mutation, provider/model calls, network expansion, credential/session access, issue sync, PR creation/update, merge, cleanup, failed-check bypass, Claude launch, or broad autonomy.

Stop before applying generated patches. Generated patches remain artifacts for operator review only.

### Accepted Path After Bob Approval

After Bob accepts this packet, Kendall may implement and verify the narrow Story 8.5 accepted path with these limits:

1. The supervisor may add the approved-path code needed to evaluate the accepted packet and enter a launch-starting `ExecutionAttempt` only for the exact envelope.
2. The first implementation target remains the Story 8.5 artifact-only fixture path, not a production subscription CLI target.
3. The launch path must still record `processLaunchAllowed`, `executionAllowed`, `processLaunchAttempted`, shell/credential/external-send attempted flags, lifecycle state, timeout/cancellation metadata, bounded byte counts, redaction/truncation status, and artifact references.
4. The launched command, if any, must be a safe local fixture command using argument-array execution, approved cwd/workspace plan, approved timeouts, and environment allowlist only.
5. Workflow events must retain only metadata and artifact references. Raw stdout, raw stderr, generated patch content, prompts, completions, provider payloads, secrets, credentials, session material, and source snapshots remain excluded.
6. Any mismatch, stale field, expired approval, unsupported target/template, failed verification, or attempt to cross denied authorities must return to blocked/rejected state.
7. This approval does not authorize production subscription CLI process launch, source mutation, generated patch application, provider/model calls, network expansion, credential/session access, issue sync, PR operations, merge, cleanup, failed-check bypass, Claude launch, or broad autonomy.

### Exact Acceptance Statement Accepted From Bob

Bob accepted this exact statement:

> I approve the Story 8.5 exact subscription-agent launch approval packet for the artifact-only fixture path only.

The full packet language remains:

> I approve the Story 8.5 exact subscription-agent launch approval packet for the artifact-only fixture path only. Authority family: subscription-agent launch. Operation: allow Kendall to implement and verify exactly one approval-bound artifact-only launch-starting path for the current Story 8.5 work item and execution attempt. Scope: one work item, one execution attempt, one route decision, worker `subscription.agent.disabled`, lane `subscription_agent`, authority mode `operator_approval_required`, workspace plan `subscription-workspace-plan-{attempt_id}`, launch policy `epic-8-first-subscription-launch-policy-v1`, target `codex.subscription.disabled`, command template `codex-subscription-cli-template-disabled-v1`, permission envelope `approved_for_one_artifact_only_subscription_launch`, output mode `artifact-only`. Safety envelope: `PATH`-only environment allowlist, blocked credential/session paths as listed in this packet, raw output bytes `0`, artifact references only, redaction required, truncation to approved artifact limits, startup timeout 10 seconds, run timeout 30 seconds, cancellation timeout 5 seconds, metadata-only lifecycle/heartbeat/orphan/reconciliation/cleanup/rollback policies. Verification command: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k subscription_agent_launch`. Expiry: 30 minutes from this approval message. Stop lines: no production subscription CLI launch, no source mutation, no generated patch application, no credentials or sessions, no provider/model calls, no network expansion, no issue sync, no PR/merge/cleanup, no failed-check bypass, no Claude launch, and no broad autonomy.

## Next Safe Action

Implement and verify the Story 8.5 accepted artifact-only fixture path. Production subscription CLI launch and all broader authorities remain blocked.
