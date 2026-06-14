# Real CLI Worker Launch Approval Packet

Date: 2026-06-14
Status: approval-required, non-executing packet
Authority family: `worker-process-launch`
Operation candidate: one bounded real CLI worker launch

## Purpose

This packet refreshes the real CLI worker launch boundary after Story 6.1 proved fake-worker orchestration and Epic 7 proved bounded supervised Codex launch patterns. It prepares exact approval requirements for a future real Codex CLI or Claude Code CLI process launch. It does not launch Codex, launch Claude, execute shell commands, mutate source, call providers, access credentials, sync issues, deliver PRs, or perform cleanup.

## Current Evidence Baseline

| Evidence | Current state |
| --- | --- |
| Story 6.1 | Done for fake-worker spike; real Codex and Claude CLI launch still blocked. |
| Epic 7 | Proved bounded supervised Codex worker launch patterns for approved scope and green-gate evidence. |
| Story 11.3 decision packet | Lists worker authority as requiring exact approval and current evidence. |
| Current repo hygiene | GitHub delivery and cleanup evidence through PR #113 is clean on `main`. |

## Candidate Operation

One future real CLI worker launch may be proposed if Bob accepts exact approval.

Allowed shape:

- One work item.
- One execution attempt.
- One route decision.
- One worker id.
- One tool identity: Codex CLI or Claude Code CLI, not both.
- One command template.
- Argument-array execution only; no shell expansion.
- Approved repo/worktree path and file scope.
- Diff guard before and after mutation when source mutation is approved.
- Prompt/source retention policy.
- Verification command.
- Timeout/cancellation policy.
- Metadata-only retained evidence.
- Human review/stop path.
- Rollback/recovery path.

## Required Approval Binding

Any future real CLI worker launch evidence must bind:

- Authority family: `worker-process-launch`
- Operation: one bounded real CLI worker launch
- Tool identity: `codex-cli` or `claude-code-cli`
- Work item id
- Execution attempt id
- Route decision id
- Worker id
- Lane
- Authority mode
- Command template id
- Command argv template
- Approved cwd/worktree path
- Allowed file scope
- Source mutation permission
- Diff guard policy
- Prompt/source retention policy
- Environment allowlist
- Blocked credential/session paths
- Timeout/cancellation policy
- Verification command
- Review requirement
- Retained evidence
- Operator
- Approval timestamp
- Rollback/recovery path
- Stop lines
- Expiry or review point

Arbitrary, ambiguous, stale, expired, mismatched, or underspecified approval IDs must be rejected.

## Codex-Specific Requirements

Codex CLI launch may be considered for implementation work only when:

- File scope is explicit.
- Verification command is explicit.
- Diff guard is enabled before delivery eligibility.
- Output retention is metadata/artifact-reference only.
- Source mutation is limited to approved paths.
- PR delivery remains a separate authority family.

## Claude-Specific Requirements

Claude Code CLI launch may be considered for scarce review work only when:

- Review purpose is explicit.
- Output contract is findings only unless a later approval grants edits.
- Cost/scarcity policy is explicit.
- No source mutation occurs by default.
- Findings are ordered by severity.
- Context scope excludes secrets, credentials, raw prompts, provider payloads, and unnecessary source copies.

## Required Stop Lines

- Do not launch a real CLI worker from this packet alone.
- Do not use shell string execution.
- Do not run both Codex and Claude from one approval.
- Do not broaden file scope by implication.
- Do not mutate source unless source mutation is explicitly approved for the named tool, work item, and file scope.
- Do not retain raw prompts, completions, provider payloads, credentials, sessions, or unnecessary source copies.
- Do not read GitHub tokens, browser sessions, SSH keys, cloud credentials, or provider credentials.
- Do not turn review authority into implementation authority.
- Do not deliver PRs, merge, delete branches, delete worktrees, clean filesystem residue, sync issues, or bypass failed checks from worker-launch authority.

## Rollback And Recovery

If approval, tool identity, file scope, command template, environment allowlist, retention policy, diff guard, verification, operator, timestamp, or rollback evidence is missing or stale:

- Keep real CLI worker launch disabled.
- Return to fake-worker/readiness evidence.
- Preserve metadata-only rejected-attempt evidence naming the missing gate.

If a future approved launch fails:

- Preserve terminal-state metadata only.
- Stop automatic retry.
- Inspect diff and output artifacts.
- Revert or preserve changes according to the approved rollback path.
- Regenerate approval before any new worker launch.

## Exact Approval Template

`I approve the worker-process-launch lane for one bounded real CLI worker launch using tool <codex-cli-or-claude-code-cli>, work item <work-item-id>, execution attempt <attempt-id>, route decision <route-decision-id>, worker <worker-id>, lane <lane>, authority mode <authority-mode>, command template <command-template-id>, command argv <argv-template>, cwd/worktree <cwd-or-worktree>, allowed file scope <file-scope>, source mutation permission <source-mutation-permission>, diff guard policy <diff-guard-policy>, prompt/source retention policy <retention-policy>, environment allowlist <env-allowlist>, blocked credential/session paths <blocked-paths>, timeout/cancellation policy <timeout-policy>, verification command <verification-command>, review requirement <review-requirement>, retained evidence <metadata-only-evidence>, operator <operator>, approval timestamp <approval-timestamp>, rollback path <rollback>, stop lines <stop-lines>, and expiry/review point <expiry>.`

## Verification

- `pnpm.cmd run check:docs`

If a later story changes worker launch contracts, supervisor service code, orchestrator state, dashboard rendering, drift checks, or tests, it must also run the smallest relevant worker/orchestrator check and full `pnpm.cmd run check` before merge.

