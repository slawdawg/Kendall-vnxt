# Tool Churn RCA Workflow

Date: 2026-06-13
Status: active guidance

## Purpose

Reduce wasted tokens, time, and frustration when command or tool execution keeps
failing for preventable reasons. This workflow is a stop-and-diagnose path for
known local friction, not a replacement for normal implementation work.

## Trigger Conditions

Enter Tool Churn RCA when any of these happen:

- The same command or tool path fails twice.
- A sandbox runner timeout happens before process output.
- A shell quoting, parser, wildcard, or scriptblock error repeats.
- A tool, executable, path, venv, package manager, or resolver is missing.
- A different wrapper command fails for the same unresolved dependency,
  import, path, permission, sandbox, or verification condition.
- A permission, sandbox, safe-directory, credential, or ownership denial blocks progress.
- A verification command fails because of environment setup rather than story behavior.
- The agent is about to retry the same failed command shape after repo guidance says to simplify it.
- The agent cannot explain what a retry would prove that the previous attempt did not.

Immediate RCA is allowed after one failure for known-bad patterns named in
`AGENTS.md`, especially sandbox runner timeouts before command output and
repeated shell quoting shapes.

## Failure Classes

Classify the failure before choosing another action:

| Class | Meaning | Typical evidence |
| --- | --- | --- |
| `quoting` | Shell syntax, escaping, wildcard, redirection, or scriptblock shape is wrong | Parser error, unexpected variable expansion, blank structured fields |
| `path-or-tool` | Expected executable, path, venv, package, or script is missing or not on PATH | command not found, missing file, wrong venv |
| `sandbox` | The sandbox runner or filesystem/network policy blocked or destabilized the action | runner timeout before output, restricted write, network denied |
| `permission` | OS, Git, GitHub, scheduler, or ACL permission blocked the action | access denied, dubious ownership, auth required |
| `dependency` | Dependencies are missing, stale, or not installed for the current worktree | module not found, lockfile install required |
| `verification` | The check itself ran but failed for code/docs behavior | assertion failure, docs drift, lint error |
| `stale-state` | Local manifests, worktrees, branches, caches, or generated files are stale | missing manifest, orphan path, stale branch/head |
| `review-state` | GitHub PR review/conversation state is incomplete or was read through the wrong surface | merge blocked with green checks, unresolved review thread, flat comments empty |
| `unknown` | Evidence is insufficient to classify safely | partial output, ambiguous failure |

## RCA Packet

Keep the packet short unless the issue threatens safety, data loss, CI, or
user-facing behavior.

Use this workflow directly. Use `docs/workflows/tool-churn-rca-examples.md`
for packet examples when a concrete Kendall_Nxt failure pattern would prevent
another vague retry.

```text
Tool Churn RCA Packet
- What failed:
- Failure class:
- Most likely cause:
- Evidence:
- Retry stop line:
- One next safe action:
- Durable fix recommendation:
```

## Retry Stop Lines

Stop retrying and write the RCA packet when:

- Two attempts fail with the same command/tool path.
- The second attempt only changes superficial quoting or formatting.
- The command string changes but the stable failing condition is unchanged,
  such as the same missing module, dependency, permission boundary, sandbox
  boundary, path, resolver, or assertion environment.
- A runner timeout happens before output twice.
- The retry would require new authority, network, credentials, destructive cleanup, or paid usage.
- The failure class is still `unknown` after one simple diagnostic command.

## Next Safe Actions

Choose one narrow action that can actually reduce uncertainty:

- Confirm location with `pwd`.
- Check diff scope with `git diff --stat` or `git diff --name-only`.
- Verify direct tool availability, for example `node --version`, `pnpm --version`, `uv --version`, or the project venv Python path.
- Replace a complex shell shape with a simpler direct shell command.
- Read the existing script or docs before invoking package-manager indirection.
- For repeated module, package, or import resolution failures, inspect existing
  project imports, package manifests, and supported scripts before changing
  command wrappers again.
- Request approval for the exact read-only verification command when sandbox behavior is the blocker.
- For Node workspace tests that fail with a read-only `.git/worktrees` write
  while creating temporary worktree metadata, request approval for the exact
  same read-only verification command outside the sandbox instead of changing
  the test file, skipping the worktree test, or narrowing the command to hide
  the boundary.
- For `uv run --directory services/supervisor ...` failures that report a
  read-only user cache path, request approval for the same read-only command
  outside the sandbox instead of changing package-manager or Python command
  shapes.
- For merge blockers with green checks, run the thread-aware GitHub review
  comment workflow from the PR branch worktree before retrying merge commands
  or speculating about branch policy.
- Park the blocked lane and continue safe local/read-only work if the goal has other useful tasks.

## Durable Fix Paths

Recommend exactly one durable fix unless the issue needs a larger story:

- Update `AGENTS.md` with the better command shape or stop line.
- Add or harden a wrapper script, preflight check, doctor check, or docs check.
- Add a story/refactor task for brittle tooling.
- Ask the operator to approve a memory note when the lesson should persist across sessions.
- Create an approval packet when the next action crosses authority boundaries.
- Record the issue in the current story Dev Agent Record if it is local to the story.

## Non-Goals

This workflow does not approve destructive cleanup, GitHub mutation, provider
calls, paid usage, credential/session access, worker launch, process launch, or
failed-check bypass. It diagnoses churn and recommends the next safe move.
