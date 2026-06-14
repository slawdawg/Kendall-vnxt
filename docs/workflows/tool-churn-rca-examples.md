# Tool Churn RCA Examples

Date: 2026-06-14
Status: active examples

## Purpose

Give agents concrete packet shapes for common Kendall_Nxt tool churn. These are
examples, not automatic approvals to retry, escalate, clean up, mutate GitHub,
or bypass failed checks.

## Windows Sandbox Runner Timeout

```text
Tool Churn RCA Packet
- What failed: A verification command timed out before producing process output.
- Failure class: sandbox
- Most likely cause: Native Windows sandbox runner setup raced or stalled before the command started.
- Evidence: No command stdout/stderr appeared before the timeout.
- Retry stop line: Stop after two pre-output runner timeouts for the same verification path.
- One next safe action: Confirm the runner with Get-Location, then retry once with the simplest direct command shape.
- Durable fix recommendation: If the simplified retry also times out before output, request approval for the same read-only verification command outside the sandbox and record the timeout in the story Dev Agent Record.
```

## PowerShell Quoting Or Parser Error

```text
Tool Churn RCA Packet
- What failed: A PowerShell command failed with a parser or quoting error.
- Failure class: quoting
- Most likely cause: The command shape mixed nested quotes, variables, scriptblocks, or shell semantics from another shell.
- Evidence: PowerShell reported a parser error before the intended tool ran.
- Retry stop line: Do not retry the same nested quoting shape.
- One next safe action: Replace the command with a direct PowerShell command that uses -LiteralPath and avoids nested powershell -Command.
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
- One next safe action: Check services\supervisor\.venv\Scripts\python.exe --version, then run the repo setup command if the venv is missing.
- Durable fix recommendation: Record the setup requirement in the story Dev Agent Record and prefer pnpm.cmd run test:supervisor after setup.
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
