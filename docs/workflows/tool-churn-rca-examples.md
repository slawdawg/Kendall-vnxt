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

## Dashboard Fixture Nested Process Permission Boundary

```text
Tool Churn RCA Packet
- What failed: `pnpm run test:dashboard-pipeline-fixtures` reached the import-boundary fixture, but its nested `spawnSync` checker was blocked before producing the expected stderr diagnostics.
- Failure class: sandbox
- Most likely cause: The Codex sandbox denied the nested Node process with EPERM, EACCES, or EROFS; this is an execution boundary, not a product or fixture-contract failure.
- Evidence: The fixture emits a structured `SANDBOX_NESTED_PROCESS_BLOCKED` marker containing the shared classifier signature and child command; no import-boundary assertions are evaluated for that one subtest.
- Retry stop line: Do not retry the nested checker or alter fixture assertions inside the sandbox after this marker appears.
- One next safe action: Request approval to rerun the exact same read-only command, `pnpm run test:dashboard-pipeline-fixtures`, outside the sandbox.
- Durable fix recommendation: Keep the scoped self-skip and marker as boundary evidence, then retain the outside-sandbox 18/18 result as the full coverage record. Ordinary child failures must remain unsuppressed.
```

## Git Metadata Lock EROFS

```text
Tool Churn RCA Packet
- What failed: A read-only Git verification command failed while trying to write a Git metadata lock such as `.git/ORIG_HEAD.lock`.
- Failure class: sandbox
- Most likely cause: The sandbox permits repository reads but blocks Git metadata writes needed by the command.
- Evidence: Output includes `.git/ORIG_HEAD.lock`, `.git/index.lock`, or another `.git/*.lock` path with `EROFS` or `Read-only file system`.
- Retry stop line: Do not delete lock files, change Git recovery commands, or retry Git wrappers inside the sandbox after this signature appears.
- One next safe action: Request approval to rerun the exact same read-only verification command outside the sandbox.
- Durable fix recommendation: Keep this as sandbox-boundary evidence unless the same Git metadata lock failure recurs outside the sandbox.
```

## Git Worktree Metadata EROFS

```text
Tool Churn RCA Packet
- What failed: A Node workspace verification command failed while a test tried to create temporary Git worktree metadata.
- Failure class: sandbox
- Most likely cause: The sandbox can read the repository but cannot write required metadata under the primary checkout's `.git/worktrees` directory.
- Evidence: Output includes `fatal: could not create directory of '<repo>/.git/worktrees/<temporary-worktree-name>': Read-only file system`.
- Retry stop line: Do not retry the same workspace test inside the sandbox after this `.git/worktrees` EROFS signature appears.
- One next safe action: Request approval to rerun the exact same read-only verification command outside the sandbox; do not skip the Git-worktree test or change the test scope just to avoid the boundary.
- Durable fix recommendation: Keep this as an environment-boundary note in lane evidence unless the test can be refactored to use an isolated temporary repository without weakening cleanup or worktree coverage.
```

## Managed Worktree Manager Shard Fixture Write

```text
Tool Churn RCA Packet
- What failed: `node ./scripts/run-manager-control-plane-shards.mjs <shard> --jobs 1` or the underlying `node --test tests/manager-control-plane.test.mjs` failed before executing the target assertions.
- Failure class: sandbox
- Most likely cause: The managed worktree lives outside the sandbox writable root, while manager tests create ignored BMAD fixture or worktree-local state under `_bmad-output`, `.git/worktrees`, or managed-worktree temp paths.
- Evidence: Output includes `ENOENT`, `EROFS`, `EACCES`, or `EPERM` while creating or opening ignored fixture/state paths such as `_bmad-output/planning-artifacts/...`.
- Retry stop line: Do not retry the same manager shard or underlying Node test inside the sandbox after this signature appears, and do not change the shard/test scope to hide the boundary.
- One next safe action: Request approval to rerun the exact same focused manager shard outside the sandbox.
- Durable fix recommendation: Add the command family to `AGENTS.md` known sandbox-boundary commands and preserve the outside-sandbox verification result as lane evidence.
```

## Supervisor Uv Cache EROFS

```text
Tool Churn RCA Packet
- What failed: A supervisor `uv run --directory services/supervisor ...` verification command failed before pytest or Python checks ran.
- Failure class: sandbox
- Most likely cause: `uv` needed to create or lock files under the user's cache directory, but the sandbox made that path read-only.
- Evidence: Output includes `Could not acquire lock`, `Could not create temporary file`, or `Read-only file system` at a path under `$HOME/.cache/uv`.
- Retry stop line: Do not switch between `uv`, `python`, and pnpm wrappers after this cache EROFS signature appears.
- One next safe action: Request approval to rerun the exact same `uv run --directory services/supervisor ...` command outside the sandbox.
- Durable fix recommendation: Preserve the outside-sandbox verification result as lane evidence; consider a future uv cache preflight only if the same signature recurs outside managed sandbox constraints.
```

## Tmux Socket Operation Not Permitted

```text
Tool Churn RCA Packet
- What failed: A read-only tmux probe could not connect to the tmux socket.
- Failure class: sandbox
- Most likely cause: The sandbox blocked tmux socket access even though the probe was metadata-only.
- Evidence: Output includes `tmux`, a socket path such as `/tmp/tmux-1000/default`, and `Operation not permitted`.
- Retry stop line: Do not mutate tmux sessions, restart panes, or switch to pane scrollback capture to work around the socket boundary.
- One next safe action: Request approval to rerun the exact same read-only tmux or manager orientation command outside the sandbox.
- Durable fix recommendation: Keep the outside-sandbox probe result as metadata-only lane evidence; update AGENTS.md only if a new recurring command needs an explicit stop line.
```

## Local Codex Workspace State EROFS

```text
Tool Churn RCA Packet
- What failed: A read-only manager or workspace inspection command could not access local Codex workspace state under `.codex-workspaces`.
- Failure class: sandbox
- Most likely cause: The sandbox blocked required task, assignment, cleanup, or managed-worktree state access.
- Evidence: Output includes `.codex-workspaces` or an explicit Codex task/assignment state path with `EROFS` or `Read-only file system`; generic `workspace metadata` text alone is not enough.
- Retry stop line: Do not treat hidden or unreadable workspace state as empty state, and do not narrow the command to skip the state probe.
- One next safe action: Request approval to rerun the exact same read-only command outside the sandbox.
- Durable fix recommendation: Preserve the outside-sandbox result as lane evidence; add a classifier fixture when the signature was not recognized.
```

## PR Review Threads After Green CI

```text
Tool Churn RCA Packet
- What failed: A PR appeared merge-ready because CI checks passed, but GitHub still had unresolved or current review threads.
- Failure class: review-state
- Most likely cause: The runner treated check status or flat PR comments as complete review evidence instead of reading thread-aware review state.
- Evidence: `gh pr checks` is green, but GraphQL `reviewThreads` includes unresolved current threads or `gh pr view` reports a blocked merge state.
- Retry stop line: Do not retry merge commands or speculate about branch protection until thread-aware review state has been fetched from the PR branch context.
- One next safe action: Use the GitHub PR comment workflow or GraphQL review-thread fetch, address actionable unresolved threads, rerun focused verification, push, then re-check review threads after the latest head.
- Durable fix recommendation: Keep the end-to-end lane runner merge gate requiring post-push thread-aware review checks and resolve only threads addressed by code, docs, tests, or explicit operator decision.
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

## Managed Workspace Finish Wrapper Hang

```text
Tool Churn RCA Packet
- What failed: `codex-workspace finish-pr --verify scoped` hung twice without child output after the lane's direct focused checks had already completed.
- Failure class: wrapper boundary (the cause remains unknown until bounded diagnostics are captured).
- Most likely cause: hypothesis only—finish-pr's nested verification/manifest path may have stalled independently of the direct test command; a stale ephemeral lane lock is possible but must not be inferred without diagnostics.
- Evidence: two no-output hangs; direct focused verification and review evidence already passed; no source/runtime failure was reported.
- Retry stop line: Do not retry the same finish-pr verification wrapper or change test scope to hide the hang.
- One next safe action: preserve the recorded direct verification evidence, inspect the lock path read-only, verify lane ownership, compare its mtime/heartbeat to a configured stale threshold (fail closed on missing or invalid timestamps), and verify no active process or descendants remain; if inspection is denied, missing, or sandbox-incomplete, stop, capture the exact error, and request the same read-only inspection outside the sandbox. Classify network, credential, or provider diagnostics separately and forbid Git fallback until that recovery is resolved; if bounded timeout/exit diagnostics remain unavailable or the cause remains unknown, fail closed and do not fall back. Only then clear a stale lane-owned lock with an approval packet naming authority family, operation, scope, and evidence refs. Use explicit scoped Git commit/push/PR commands only after reconciling the lane owner, worktree, branch/base, allowlisted diff, exact HEAD, checks, and review evidence; require pass evidence for each manifest-lock, anti-churn-finalization, authority-decision, intentional-staging, push-before-PR, and stop-line gate, and hold the manifest lock and anti-churn gate through finalization and every delivery mutation (commit, push, and PR creation) rather than recording equivalent gates after the fact.
- Durable fix recommendation: Add a bounded finish-pr child timeout that captures elapsed timeout, exit code or signal, stderr, child process tree, and lock state; terminates only verified lane-owned process identities with matching start times (fail closed on ownership or PID-reuse ambiguity), verifies descendants exited, re-reads the manifest and lock, verifies owner/path/age before any stale-lock cleanup, preserves the manifest, and fails with a recoverable diagnostic instead of waiting indefinitely.
```
