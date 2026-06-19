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

## Token Economy and Progress Visibility

Use a quiet competent operator posture by default. Routine updates should be
short and should report the current phase, meaningful deltas, blockers, or the
next decision point. Do not repeat background context, restate an already agreed
plan, or narrate obvious command mechanics when nothing important changed.

When something important changes, explain it in plain English for Bob:

- What changed?
- Why does it matter?
- What happens next?

Token economy must not make automation invisible. Keep lightweight signs of
life during real work, especially during long-running tasks, but spend words on
state changes rather than ceremony.

Never compress away safety or steering information. Be explicit when work
touches approvals, destructive operations, source or evidence boundaries,
provider calls, paid usage, worker or process launch, GitHub delivery, cleanup,
failed checks, uncertainty, or a decision Bob needs to make.

If command or tool churn appears, stop blind retries and route to
`docs/workflows/tool-churn-rca.md`. Trigger that workflow when the same
command/tool path fails twice, when a Windows sandbox runner timeout happens
before command output, when PowerShell quoting/parser errors repeat, when a
missing tool/path or permission denial blocks progress, or when guidance already
identifies the attempted command shape as known-bad. Use
`docs/workflows/tool-churn-rca-examples.md` when a concrete packet example would
prevent another vague retry.

Before loading broad context, check `docs/ai-context/index.md` for the smallest
relevant first-read path. Prefer exact source links, small summaries, and
narrow `rg`/file reads over dumping large artifacts into chat.

## Git and Edit Hygiene

- Check `git diff --stat` or `git diff --name-only` before and after edits when
  troubleshooting. Do not clean up, revert, format, or reorganize unrelated
  files unless the user explicitly asks.
- Avoid repo-wide formatters or generated-file rewrites unless the task
  requires them. Prefer targeted edits that keep diffs reviewable.
- When adding durable agent behavior, update this `AGENTS.md` rather than
  relying only on a one-off chat reminder.
- Treat generated agent artifacts according to
  `docs/workflows/generated-agent-artifacts.md`. Do not commit personal BMAD
  user config, and do not remove `.agents/skills`, `.claude/skills`, or `_bmad`
  without the matching source-of-truth and regeneration review.
- Do not default to opening a PR for every small local improvement. Treat PRs
  as reviewable product or workflow delivery units that should be merged into
  `main`, such as completed stories, user-visible features, safety/CI fixes,
  docs/research deliverables, or changes that unblock another lane. Batch small
  helper fixes, test hardening, docs polish, and implementation prep locally
  until they form a coherent story-sized change or Bob explicitly asks for a PR.
- Use the matching BMAD-method skill for BMAD work instead of doing an
  informal shortcut. Before creating or changing epics, stories, PRDs,
  architecture notes, sprint plans, retrospectives, reviews, or BMAD-driven
  implementation artifacts, load and follow the relevant `bmad-*` skill and
  preserve its intended interactive checkpoints unless Bob explicitly asks for
  a non-BMAD shortcut.
- If command output is needed for diagnosis, prefer concise structured output
  over formatted tables. Use `Select-Object` for properties and only format for
  final human display.
- For implemented code changes, route review requests through
  `bmad-code-review` first. Use individual reviewers such as
  `bmad-review-adversarial-general`, `bmad-review-edge-case-hunter`, or
  `knx-safety-validation-review` only as follow-up lenses when the bundled
  code-review workflow leaves a specific gap.

## Long-Running Dev Goals

When Bob starts or approves a long-running development goal, treat it as a
durable, milestone-driven workflow rather than a single unbounded task.

- Maintain durable goal state in repo artifacts when the goal is larger than a
  single story. Track current milestone, completed stories, next safe work,
  blockers, verification state, and open approval requests.
- Keep an authority ledger for any goal that may touch execution, provider
  calls, source mutation, Git/GitHub operations, worker launch, cleanup, merge,
  secrets, or retention policy. Approvals must name the authority family,
  operation, scope, and evidence. Generic "continue" language does not approve
  new authority.
- Use progressive authority for all automation: document intent and stop lines,
  add contracts first, preview/report, use fake adapters, dry-run real tools,
  move to read-only real integration, then bounded write integration, then
  human-approved execution, and only later policy-approved low-risk automation.
- If one lane or task is blocked waiting for Bob approval, pause that specific
  lane/task and continue other safe unblocked work. Stop only when no meaningful
  safe work remains, unsafe behavior appears, scope expands beyond the approved
  goal, or the gated operation is the next unavoidable step.
- Treat refactoring and maintenance as valid goal work when it reduces
  fragmentation, removes obsolete prototype concepts, clarifies naming,
  improves Dev Console usability, stabilizes tests, fixes brittle scripts, or
  makes the pipeline safer. Keep these changes scoped and verified; avoid
  opportunistic repo-wide churn.
- If churn or repeated failures come from bugs, brittle tooling, misformatted
  commands, fragile scripts, unclear runbooks, flaky tests, Windows quoting, or
  other preventable workflow errors, fix the root cause when safe and in scope
  rather than repeatedly working around it.
- Prefer one source of truth for state. Avoid parallel models for the same
  lifecycle. Make ownership clear for Candidate Work, WorkItem,
  ExecutionAttempt, events, evidence, and cleanup state.
- Do not make automation invisible. Automated actions must leave evidence:
  what ran, why it was allowed, authority level, input/output summary, result,
  next step, and recovery path.
- Keep Bob's attention focused. Interrupt only for decisions, approvals,
  blockers, failed checks, scope expansion, scarce paid/review resources, or
  unsafe behavior.
- For mutating automation, define recovery before or during implementation:
  resume, retry, rollback, inspect failure, preserve evidence, and cleanup.
- Preserve metadata and links, not raw prompts, completions, reasoning traces,
  provider payloads, secrets, or unnecessary source copies unless Bob
  explicitly approves that retention.
- Split large output into reviewable PR-sized milestones even if the same
  long-running goal continues afterward.
- Verify startup and environment assumptions as part of relevant milestones on
  the Windows VM, especially when the work affects the supervisor, dashboard,
  scheduled tasks, tools, or PATH-sensitive commands.

## Codex Workspace Protocol

Use the repo-owned Codex workspace workflow when Bob asks to start, list,
resume, finish, or clean up mobile/SSH Codex work. The deterministic command
surface is `node ./scripts/codex-workspace.mjs`.

- When Bob says "start a new task", "create a worktree", or similar, ask at
  most three quick clarifying questions only if the task intent, base branch,
  or PR-vs-experiment mode is unclear. Otherwise run
  `node ./scripts/codex-workspace.mjs start "<task description>"`.
  Use `--mode experiment` for scratch work that should not become a PR yet.
- When Bob says "list workspaces" or asks what Codex tasks are active, run
  `node ./scripts/codex-workspace.mjs list`.
- When Bob says "resume <task>", run
  `node ./scripts/codex-workspace.mjs resume "<task>"`, then use the reported
  worktree path for follow-up commands.
- When Bob says "finish this as a PR", run the smallest relevant verification,
  then use `node ./scripts/codex-workspace.mjs finish-pr` from the task
  worktree or pass a task query from another worktree. Stage intended files
  explicitly before `finish-pr`; use `--stage-all` only after confirming the
  full worktree diff belongs to the task. Do not merge to `main` unless Bob
  explicitly asks for a merge after seeing the PR state.
- When Bob says "clean up merged work", run
  `node ./scripts/codex-workspace.mjs cleanup-merged` first as a dry-run. The
  script must see a merged PR with the expected base branch and a clean
  worktree before it removes anything. Re-run with `--apply` only when the
  dry-run output is correct.
- When Bob says "recover workspace state" or manifests appear stale, run
  `node ./scripts/codex-workspace.mjs rebuild-index --dry-run` before applying
  any rebuilt local manifests.
- Run `node ./scripts/codex-workspace.mjs doctor` when diagnosing workspace
  protocol readiness. `gh` availability is required for `finish-pr` and
  `cleanup-merged`, even if doctor reports it as a warning for read-only
  commands.

Default workspace state is local-only under a stable repo key such as
`%USERPROFILE%\.codex-workspaces\slawdawg-kendall-vnxt`, derived from the
GitHub remote when available. Do not commit task manifests from that local
state root. Keep GitHub Actions out of the routine workspace lifecycle unless
Bob explicitly approves a future workflow change.
