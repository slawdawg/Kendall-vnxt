# Kendall_Nxt Agent Notes

## Windows Sandbox

- On native Windows Codex sandbox sessions, do not run multiple `shell_command`
  tool calls in parallel. The Windows sandbox setup path can race when several
  commands launch at once, producing runner pipe timeouts before the command
  starts. Run shell diagnostics and verification commands sequentially unless
  the sandbox is disabled or the work is running outside native Windows.
- Do not use `multi_tool_use.parallel` for commands that invoke
  `functions.shell_command` in this Windows workspace. Parallel file reads may
  be useful elsewhere, but here they can fan out into simultaneous sandbox
  setup attempts and destabilize the runner.
- If a command fails with a Windows sandbox runner timeout before producing
  process output, treat the result as inconclusive. Confirm the runner with a
  simple serialized no-op such as `Get-Location`, then retry once with a
  simpler command shape.
- For Node or pnpm verification commands, such as `node ./scripts/*.mjs`,
  `pnpm.cmd run check:*`, or `pnpm.cmd run check`, if the sandbox runner
  times out before output twice, stop retrying inside the sandbox and request
  approval to run the same read-only verification command outside the sandbox.
- Verify direct tool availability before resolver scripts or package-manager
  indirection. Use `node --version`, `uv --version`, `pnpm --version`, or
  `services\supervisor\.venv\Scripts\python.exe --version` before retrying
  `pnpm run ...`, Node resolver scripts, or Python readiness checks.

## PowerShell Commands

- Prefer running PowerShell directly in the current shell over nested `powershell -Command "..."`.
- Avoid nested `powershell -Command "..."` when the command contains `$variables`, `$_`, loops, arrays, scriptblocks, or mixed quotes. Use a direct command or a small `.ps1` script/block instead.
- Do not retry the same failed quoting shape. Simplify the command first.
- Use `Get-Content -Raw` for whole-file reads, parser/token checks, and text that must preserve line structure.
- Quote literal paths and use `-LiteralPath` for file operations when possible.
- Avoid `Format-Table` and `Format-List` when another command needs the data; formatting is for display only and can hide structured properties.
- Prefer assigning command results to variables and inspecting properties directly when working with structured objects such as scheduled tasks, CIM objects, and process records.
- For interactive tools such as Codex, prefer Windows user-logon startup over pre-login boot services. A pre-login service does not provide a useful interactive terminal.
- For per-user Windows Scheduled Tasks, prefer `New-ScheduledTaskPrincipal -RunLevel Limited` unless elevation is truly required. `-RunLevel Highest` can make otherwise ordinary per-user task registration fail with access denied.
- When working with Windows Scheduled Tasks, expect both registration and detailed inspection to require task-scheduler permissions. If `Get-ScheduledTask` fails with access denied after registration used elevation, verify through the same approved/elevated path instead of assuming the task is missing.
- When verifying Scheduled Task actions, inspect the raw `$task.Actions` objects directly. Computed `Select-Object` projections or formatted output can return blank-looking `Execute`/`Arguments` fields even when the task action is valid.
- For cmdlet enum parameters, verify accepted values with `Get-Help`, parameter metadata, or the error message before retrying with guessed names. Use the exact enum names PowerShell reports, such as `Limited` or `Highest` for `New-ScheduledTaskPrincipal -RunLevel`.
- Prefer native PowerShell cmdlets over `cmd /c` unless `cmd` behavior is specifically required.
- Remember PowerShell wildcards, quoting, redirection, and command separators differ from Bash; check the shell semantics before porting command shapes.

## Tool Resolution and Verification

- First response checklist for environment or command failures:
  1. Confirm location with `Get-Location`.
  2. Check current diff scope with `git diff --stat` or
     `git diff --name-only`.
  3. Verify direct tool availability before resolver scripts, such as
     `node --version`, `uv --version`, `pnpm --version`, or
     `services\supervisor\.venv\Scripts\python.exe --version`.
  4. Run one shell command at a time while the native Windows sandbox is active.
- Do not use bare `python` for project checks on this Windows machine. It can
  resolve to the Microsoft Store alias. Prefer
  `services\supervisor\.venv\Scripts\python.exe` for direct Python checks or
  `uv run --directory services/supervisor ...` when the uv-managed environment
  is required.
- Keep verification scoped to the change. Run the smallest relevant check
  first, then broaden only when the touched code crosses package, API, or
  workflow boundaries.

## Git and Edit Hygiene

- Check `git diff --stat` or `git diff --name-only` before and after edits when
  troubleshooting. Do not clean up, revert, format, or reorganize unrelated
  files unless the user explicitly asks.
- Avoid repo-wide formatters or generated-file rewrites unless the task
  requires them. Prefer targeted edits that keep diffs reviewable.
- When adding durable agent behavior, update this `AGENTS.md` rather than
  relying only on a one-off chat reminder.
- If command output is needed for diagnosis, prefer concise structured output
  over formatted tables. Use `Select-Object` for properties and only format for
  final human display.

## Codex Workspace Protocol

Use the repo-owned Codex workspace workflow when Bob asks to start, list,
resume, finish, or clean up mobile/SSH Codex work. The deterministic command
surface is `node ./scripts/codex-workspace.mjs`.

- When Bob says "start a new task", "create a worktree", or similar, ask at
  most three quick clarifying questions only if the task intent, base branch,
  or PR-vs-experiment mode is unclear. Otherwise run
  `node ./scripts/codex-workspace.mjs start "<task description>"`.
- When Bob says "list workspaces" or asks what Codex tasks are active, run
  `node ./scripts/codex-workspace.mjs list`.
- When Bob says "resume <task>", run
  `node ./scripts/codex-workspace.mjs resume "<task>"`, then use the reported
  worktree path for follow-up commands.
- When Bob says "finish this as a PR", run the smallest relevant verification,
  then use `node ./scripts/codex-workspace.mjs finish-pr` from the task
  worktree or pass a task query from another worktree. Do not merge to `main`
  unless Bob explicitly asks for a merge after seeing the PR state.
- When Bob says "clean up merged work", run
  `node ./scripts/codex-workspace.mjs cleanup-merged`. The script must see a
  merged PR and a clean worktree before it removes anything.
- Run `node ./scripts/codex-workspace.mjs doctor` when diagnosing workspace
  protocol readiness.

Default workspace state is local-only under a stable repo key such as
`%USERPROFILE%\.codex-workspaces\slawdawg-kendall-vnxt`, derived from the
GitHub remote when available. Do not commit task manifests from that local
state root. Keep GitHub Actions out of the routine workspace lifecycle unless
Bob explicitly approves a future workflow change.
