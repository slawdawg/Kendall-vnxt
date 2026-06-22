# Tool Churn RCA Examples

Date: 2026-06-14
Status: active examples

## Purpose

Give agents concrete packet shapes for common Kendall_Nxt tool churn. These are
examples, not automatic approvals to retry, escalate, clean up, mutate GitHub,
or bypass failed checks.

## Sandbox Runner Timeout

```text
Tool Churn RCA Packet
- What failed: A verification command timed out before producing process output.
- Failure class: sandbox
- Most likely cause: The sandbox runner stalled before the command started.
- Evidence: No command stdout/stderr appeared before the timeout.
- Retry stop line: Stop after two pre-output runner timeouts for the same verification path.
- One next safe action: Confirm the runner with pwd, then retry once with the simplest direct command shape.
- Durable fix recommendation: If the simplified retry also times out before output, request approval for the same read-only verification command outside the sandbox and record the timeout in the story Dev Agent Record.
```

## Shell Quoting Or Parser Error

```text
Tool Churn RCA Packet
- What failed: A shell command failed with a parser or quoting error.
- Failure class: quoting
- Most likely cause: The command shape mixed nested quotes, variables, scriptblocks, or shell semantics from another shell.
- Evidence: The shell reported a parser error before the intended tool ran.
- Retry stop line: Do not retry the same nested quoting shape.
- One next safe action: Replace the command with a simpler direct shell command or a checked-in script.
- Durable fix recommendation: Add the corrected command shape to AGENTS.md if it is likely to recur.
```

## Missing Supervisor Virtual Environment

```text
Tool Churn RCA Packet
- What failed: A supervisor Python or pytest command could not find the expected interpreter or package environment.
- Failure class: dependency
- Most likely cause: The supervisor virtual environment has not been created in this worktree.
- Evidence: The expected services/supervisor/.venv path or Python package was missing.
- Retry stop line: Do not keep switching between python, uv, and pnpm wrappers without verifying the direct tool path.
- One next safe action: Check `uv run --directory services/supervisor python --version`, then run the repo setup command if the environment is missing.
- Durable fix recommendation: Record the setup requirement in the story Dev Agent Record and prefer `pnpm run test:supervisor` after setup.
```

## Managed Worktree Pnpm EROFS

```text
Tool Churn RCA Packet
- What failed: A `pnpm run ...` verification command failed before the target check because pnpm tried to write a dependency-status temp file in the managed worktree.
- Failure class: sandbox
- Most likely cause: The sandbox filesystem denied pnpm's temporary dependency-status write, even though the intended verification was read-only.
- Evidence: Output includes `EROFS: read-only file system, open '<worktree>/_tmp_...'` followed by `Command failed with exit code 226: pnpm install`.
- Retry stop line: Do not retry the same `pnpm run ...` command inside the sandbox after this EROFS signature appears.
- One next safe action: Request approval to rerun the exact same read-only verification command outside the sandbox; do not change package-manager, script, or test scope while diagnosing this failure.
- Durable fix recommendation: Keep the command result in the lane evidence and add a wrapper/preflight only if the same EROFS signature recurs in ordinary non-sandbox runs.
```

## Playwright Browser Cache Mismatch

```text
Tool Churn RCA Packet
- What failed: A focused dashboard e2e command launched supervisor and dashboard, then Playwright failed because Chromium was missing from the configured browser cache.
- Failure class: dependency
- Most likely cause: The runner sets `PLAYWRIGHT_BROWSERS_PATH` to the worktree-local `.data/ms-playwright`, but the browser install was absent or was installed into a different default cache.
- Evidence: Output includes `Executable doesn't exist at <worktree>/.data/ms-playwright/.../chrome-headless-shell` and suggests `pnpm exec playwright install`.
- Retry stop line: Do not rerun the e2e command until the configured `PLAYWRIGHT_BROWSERS_PATH` cache has been checked or setup has run.
- One next safe action: Run `PLAYWRIGHT_BROWSERS_PATH="<worktree>/.data/ms-playwright" pnpm run setup:e2e`, then rerun the same focused e2e command.
- Durable fix recommendation: Keep the dashboard e2e runner preflight active so it fails before launching services and prints the exact setup command.
```

## Git Safe-Directory Or Permission Denial

```text
Tool Churn RCA Packet
- What failed: A Git command failed with dubious ownership, safe-directory, credential, or access-denied output.
- Failure class: permission
- Most likely cause: The command is running under a user or path ownership context Git does not trust, or it needs explicit GitHub/OS permission.
- Evidence: Git or the OS reported safe-directory, credential, ownership, or access-denied text.
- Retry stop line: Do not rerun the same Git mutation or GitHub operation until the permission boundary is understood.
- One next safe action: Run a read-only status or config inspection from the intended worktree and capture the exact permission message.
- Durable fix recommendation: Use a narrow approval packet for any credential, GitHub mutation, cleanup, branch deletion, or safe-directory change.
```
