# Kendall_Nxt Linux Goal Run Contract

Status: draft v1
Target: Ubuntu 26.04, Linux-first setup MVP

## Purpose

This contract lets a Codex `/goal` run implement the Linux Setup MVP without
live operator interaction for non-gated work. It defines the durable scope,
authority, state, evidence, and stop-line rules the run must use instead of
chat history.

## Canonical Goal Prompt

Use this objective for autonomous implementation runs:

```text
Implement the Kendall_Nxt Linux Setup MVP from repo artifacts. Work only inside
the Goal Run Contract, PRD, release-gate traceability, and implementation
stories. Complete all non-gated docs, scripts, tests, fixtures, and validation
work without live operator interaction. Do not perform provider login, paid provider
usage, external account enrollment, destructive cleanup, reboot, PR creation,
merge, or workspace cleanup unless the Authority Ledger contains a matching
bounded preauthorization. If blocked, write a blocker packet, preserve evidence,
continue only independent safe work, and leave an exact resume point.
```

## Artifact Policy

Committed planning and contract artifacts:

- `docs/linux-install/goal-run-contract.md`
- `docs/linux-install/release-gate-traceability.md`
- `docs/linux-install/fixtures/goal-run/*.json`
- `docs/linux-install/evidence/schema.md`

Runtime evidence artifacts:

- Default path: `docs/linux-install/evidence/goal-runs/<run-id>/`
- Runtime artifacts are local-only and must not be committed.
- Release claims that need Git durability must be rewritten as source-owned
  release docs or contracts. Do not track the generated evidence packet itself.
- Routine local run state, temporary logs, raw command output, and failed
  secret-bearing evidence must remain ignored local output.

## Task State Model

Every autonomous task has exactly one state:

| State | Meaning |
| --- | --- |
| `planned` | Task is known but not yet checked for readiness. |
| `ready` | Inputs, authority, and dependencies are satisfied. |
| `running` | Task is currently executing. |
| `succeeded` | Acceptance criteria and required evidence are satisfied. |
| `failed_retryable` | Task failed with an actionable retry or remediation path. |
| `failed_terminal` | Task failed and cannot safely continue without changing scope. |
| `blocked_authority` | Task requires missing authority, Manual Auth, paid usage, external enrollment, destructive cleanup, reboot, or privileged mutation. |
| `skipped_out_of_scope` | Task is outside the bounded milestone or explicitly deferred. |

The state record for each task must include task id, mapped PRD requirements,
dependencies, authority class, allowed mode, last command, next command,
evidence paths, completion condition, blocked condition, and resume command.

## Authority Decision Table

| Class | Decision | Examples |
| --- | --- | --- |
| `allowed_unattended` | May run without the operator present. | Read docs, edit repo docs/scripts, run local non-mutating checks, write redacted repo evidence. |
| `requires_preauthorization` | May run only when the Authority Ledger has a matching bounded entry. | Package install with `sudo`, repo dependency install that mutates global cache, service changes, bounded cleanup. |
| `block_and_record` | Must write a Blocker Packet and continue only independent safe work. | Missing Manual Auth, provider login needed, paid provider usage, Tailnet enrollment, reboot proof. |
| `forbidden` | Must not run. | Capturing secrets, automating OAuth/device-code login, broad destructive cleanup, using generic approval as authority. |

General language such as "continue," "do whatever is needed," or "finish it"
is not valid preauthorization.

## Authority Ledger Entry

Each preauthorization must include:

```json
{
  "schema": "kendall-linux-goal-authority/v1",
  "authority_id": "auth-20260617-example",
  "authority_family": "host-package-install",
  "operation": "install-browser-dependencies",
  "scope": "Ubuntu 26.04 host only",
  "command_ids": ["linux.setup.apply.browser-deps"],
  "allowed_targets": ["ubuntu-26.04-certified-target"],
  "maximum_impact": "install named apt packages only",
  "expires": "end-of-current-goal-run",
  "evidence_required": ["dry-run-preview", "package-list", "post-verify"],
  "rollback_or_recovery": "record installed packages; manual apt removal only",
  "approval_reference": "chat-or-ticket-id",
  "stop_lines": ["unexpected package removal", "provider login prompt"]
}
```

## Command Contract

Every runnable command referenced by an implementation story must define:

- command id
- purpose
- working directory
- argv
- timeout seconds
- authority requirement
- allowed write paths
- evidence output
- structured exit behavior
- failure type

Commands used by autonomous stories must not wait on stdin, prompt
interactively, mutate outside allowed paths, run unbounded package upgrades,
invoke provider/network auth without a declared boundary, or hide failure
behind generic exit codes.

## Installer Trust Model

Setup commands must preview privileged or host-mutating actions before apply.
The preview lists package sources, package names, global CLIs, write paths,
services, and expected evidence.

Allowed source policy:

- Prefer repo-pinned package-manager commands and official distribution package
  repositories.
- Use minimum-version checks where exact pinning would create avoidable global
  CLI churn.
- Treat unknown package sources, curl-pipe-shell patterns, unsigned downloads,
  broad package upgrades, and provider-auth commands as gated.
- Document which supply-chain guarantees are not provided by MVP.

Privileged commands require a matching authority entry unless they are run by
the user manually outside autonomous execution.

## Rollback And Recovery

Setup recovery must be explicit:

- Safe rerun is preferred over destructive rollback.
- Package installs record what was requested; automatic package removal is
  gated cleanup.
- Repo file edits are ordinary git-tracked changes and can be reviewed before
  delivery.
- Evidence is preserved after failure unless it fails redaction validation.
- Manual cleanup steps must be listed in a Blocker Packet or completion report
  when automation cannot safely undo a mutation.

## Doctor Coverage

`pnpm linux:doctor` or its implementation equivalent should classify:

- DNS failure
- package repository unavailable
- npm/pnpm registry unavailable
- TLS or certificate failure
- rate limiting
- insufficient disk space
- unsupported architecture
- unsupported shell
- missing user permissions
- missing `sudo` when a selected operation requires it
- port conflicts
- repo not writable
- required tool missing or outside supported version policy

These checks are typed failures or warnings. They do not trigger provider login
or host mutation.

## Version Drift Policy

Each setup tool is classified as:

- `pinned`: exact version required.
- `minimum`: version must be at or above a stated floor.
- `warn_only`: drift is reported but does not fail base setup.
- `unsupported`: version is outside the setup contract.

The first implementation must classify Ubuntu, Node, pnpm, uv, GitHub CLI,
Codex CLI, Claude CLI, BMAD Method, browser dependencies, and any required
package-manager tooling.

## Safe Continuation Rule

After a blocked gated operation, Codex may continue only tasks whose inputs,
dependencies, authority, and expected outputs are independent of the blocked
operation. A blocked task must not be bypassed, simulated as complete, replaced
with a weaker alternative, or used as an assumed prerequisite.

Task order is preserved unless the dependency map proves an independent task is
ready. Dependent tasks are recorded as dependency-blocked, not silently skipped.

## Blocker Packet Schema

Blocker packets are written under:

```text
docs/linux-install/evidence/goal-runs/<run-id>/blockers/<blocker-id>.json
```

Required fields:

```json
{
  "schema": "kendall-linux-goal-blocker/v1",
  "blocker_id": "blocker-example",
  "run_id": "goal-run-example",
  "task_id": "task.manual-auth.github",
  "authority_class": "block_and_record",
  "blocked_operation": "manual-github-auth",
  "reason": "GitHub auth is required for a selected workflow and must be user-operated.",
  "attempted_command": null,
  "last_safe_command": "pnpm linux:doctor",
  "proposed_next_command": "gh auth status",
  "required_user_action": "Run provider-approved GitHub auth manually, then resume.",
  "resume_command": "codex /goal resume linux-setup-mvp",
  "evidence_paths": [],
  "dependency_impact": ["task.private-repo-probe"],
  "safe_tasks_still_attempted": ["task.docs.drift"],
  "blocked_task_status": "authority-blocked-not-complete",
  "secrets_exclusion": "confirmed"
}
```

Manual Auth handoff packets must state the service/account, user-run command or
URL, expected success signal, evidence path, and resume command. They must not
contain tokens, auth URLs with secrets, device codes, or credential helper
output.

## Completion Report Semantics

Completion reports are generated from state and evidence, not hand-written
claims. Overall status is:

- `complete`: all mapped acceptance criteria satisfied, required verification
  passed, required evidence present, and no open blockers.
- `partial`: at least one deliverable completed, at least one mapped criterion
  incomplete or unverifiable, and no unavoidable authority blocker prevents all
  remaining work.
- `blocked`: next required work cannot proceed because of missing authority,
  Manual Auth, destructive operation, paid usage, external account action, or
  unsafe state, and no independent safe work remains.

Every FR and `LINUX-AC-*` item is classified as satisfied, unsatisfied,
blocked, not attempted, or deferred by approved scope.

## Terminal Delivery Rule

PR creation, merge, and workspace cleanup are final delivery-phase operations.
They are not routine development-loop actions. A `/goal` run may prepare a
delivery summary and suggested PR description, but it must not create a PR,
merge, or clean workspaces until the current bounded milestone is otherwise
complete or blocked and a matching delivery authority exists.

## Final Delivery Checklist

Before PR creation:

- Completion report is present.
- Changed files are listed.
- Release-gate status is summarized.
- Verification commands are listed with pass/fail/skipped status.
- Evidence paths are linked.
- Open blockers and skipped checks are explicit.
- No independent safe implementation work remains.

Merge requires a separate decision after PR review/check state is visible unless
the active goal explicitly grants the named GitHub delivery operation and the
PR meets the repo policy-approved low-risk delivery checklist: current lane,
expected base branch, exact reviewed head SHA, non-draft, mergeable, no failing
required or reported checks, no unresolved review threads or requested changes,
relevant local verification passed, no high-blast-radius surfaces, and a
recorded rollback path. Cleanup and local branch deletion require merged or
intentionally abandoned work, preserved evidence, recorded worktree state, and
exact cleanup or branch-deletion authority from the same standing delivery
approval or a separate approval packet.
