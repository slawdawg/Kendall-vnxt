# Subscription-Agent Process Launch Approval Packet

Date: 2026-06-13
Status: approval-required, non-executing packet
Authority family: `subscription-agent-launch`
Operation candidate: one bounded supervised subscription-agent process launch

## Purpose

This packet refreshes the deferred Story 5.5 process-launch approval boundary after Epic 8 proved only the artifact-only fixture path. It prepares the exact approval fields required before any real subscription-agent process launch. It does not launch a process, execute a shell command, inherit credentials or sessions, call providers, mutate source, sync issues, deliver PRs, or perform cleanup.

## Current Evidence Baseline

| Evidence | Current state |
| --- | --- |
| Story 5.5 | Deferred post-MVP; blocked pending explicit supervised process-launch approval. |
| Epic 8 packet | Accepted only for Story 8.5 artifact-only fixture path; production subscription CLI launch remains denied. |
| Story 8.5 | Completed approval-bound artifact-only fixture launch path. |
| Story 8.6 | Completed verification, recovery, and rollback evidence for the fixture path. |
| Direct process launch | Still blocked pending exact approval. |

## Candidate Operation

One future supervised process launch may be proposed if Bob accepts exact approval.

Allowed shape:

- One work item.
- One execution attempt.
- One route decision.
- One launch target.
- One command template.
- Argument-array execution only; no shell expansion.
- Isolated per-attempt workspace.
- Environment allowlist only.
- Credential/session denial paths enforced.
- Bounded redacted output artifacts.
- Lifecycle evidence for starting, running, cancellation, timeout, failure, and completion.
- Metadata-only retained workflow events.
- Rollback/global-disable path.

## Required Approval Binding

Any future process-launch execution evidence must bind:

- Authority family: `subscription-agent-launch`
- Operation: one bounded supervised process-launch operation
- Work item id
- Execution attempt id
- Route decision id
- Worker id
- Lane
- Authority mode
- Workspace plan id
- Launch policy id
- Launch target id
- Command template id
- Command argv template
- Approved working directory
- Environment allowlist
- Blocked credential/session paths
- Artifact limits
- Redaction and truncation policy
- Startup timeout
- Run timeout
- Cancellation timeout
- Heartbeat policy
- Child process tree policy
- Orphan detection policy
- Terminal-state reconciliation policy
- Idempotent cleanup policy
- Verification command
- Retained evidence
- Operator
- Approval timestamp
- Rollback/global-disable procedure
- Stop lines
- Expiry or review point

Arbitrary, ambiguous, stale, expired, mismatched, or underspecified approval IDs must be rejected.

## Required Stop Lines

- Do not launch a process from this packet alone.
- Do not use shell string execution.
- Do not inherit arbitrary environment variables.
- Do not read credentials, sessions, browser profiles, Git credentials, SSH keys, cloud credentials, or provider credentials.
- Do not call local, remote, or premium providers unless separately approved.
- Do not mutate source unless separately approved.
- Do not apply generated patches automatically.
- Do not sync issues.
- Do not create, update, or merge PRs from launch authority.
- Do not delete branches, worktrees, source checkouts, or filesystem residue from launch authority.
- Do not bypass failed checks.
- Do not treat the Story 8.5 artifact-only fixture approval as production process-launch approval.

## Workspace And Environment Requirements

Minimum requirements for a later executable story:

- Workspace id must bind to the execution attempt.
- Workspace root must be inside an approved runtime root.
- Launch cwd must be the approved workspace or approved repo path for the specific target.
- Environment allowlist must be explicit.
- Default deny for credential/session paths:
  - `.env`
  - `.env.*`
  - `.git`
  - `.ssh`
  - `.aws`
  - `.azure`
  - `.config/gh`
  - `.docker`
  - browser profile directories
  - Claude/Codex app session directories
  - `**/*secret*`
  - `**/*credential*`
  - `**/*token*`

## Output And Retention Policy

Default retained evidence:

- Approval packet id.
- Attempt id.
- Target id.
- Command template id.
- Process lifecycle metadata.
- Heartbeat metadata.
- Timeout/cancellation metadata.
- Exit status metadata.
- Redaction/truncation summary.
- Artifact references.
- Rollback evidence.

Default prohibited retention:

- Raw stdout/stderr in workflow events.
- Generated patch content in workflow events.
- Raw prompts.
- Raw completions.
- Provider payloads.
- Secrets.
- Credentials.
- Session contents.
- Full source snapshots.

## Rollback Path

If approval, workspace isolation, command template, environment allowlist, output policy, timeout policy, verification command, operator, retained evidence, or rollback evidence is missing or stale:

- Keep subscription-agent process launch disabled.
- Return to artifact-only fixture/readiness evidence.
- Preserve metadata-only rejected-attempt evidence naming the missing gate.

If a future approved launch fails:

- Preserve terminal-state metadata only.
- Stop automatic retry.
- Reconcile terminal state.
- Run idempotent cleanup only within the approved metadata/workspace policy.
- Re-disable launch if rollback criteria are met.
- Regenerate the approval packet before any new attempt.

## Exact Approval Template

`I approve the subscription-agent-launch lane for one bounded supervised process-launch operation using work item <work-item-id>, execution attempt <attempt-id>, route decision <route-decision-id>, worker <worker-id>, lane <lane>, authority mode <authority-mode>, workspace plan <workspace-plan-id>, launch policy <launch-policy-id>, target <target-id>, command template <command-template-id>, command argv <argv-template>, cwd <cwd>, environment allowlist <env-allowlist>, blocked credential/session paths <blocked-paths>, artifact limits <artifact-limits>, redaction/truncation policy <redaction-truncation-policy>, startup/run/cancellation timeouts <timeouts>, heartbeat/orphan/reconciliation/cleanup policies <lifecycle-policies>, verification command <verification-command>, retained evidence <metadata-only-evidence>, operator <operator>, approval timestamp <approval-timestamp>, rollback path <rollback>, stop lines <stop-lines>, and expiry/review point <expiry>.`

## Verification

- `pnpm.cmd run check:docs`

If a later story changes process-launch contracts, supervisor service code, lifecycle handling, dashboard rendering, drift checks, or tests, it must also run the smallest relevant subscription-launch/process-lifecycle check and full `pnpm.cmd run check` before merge.
