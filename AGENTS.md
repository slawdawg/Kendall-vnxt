# Kendall_Nxt Agent Notes

## Linux Shell Commands

- Run shell diagnostics and verification commands sequentially unless there is
  a clear reason to parallelize read-only file inspection.
- If a command fails with a sandbox runner timeout before producing process
  output, treat the result as inconclusive. Confirm the runner with a simple
  serialized no-op such as `pwd`, then retry once with a simpler command shape.
- For Node or pnpm verification commands, such as `node ./scripts/*.mjs`,
  `pnpm run check:*`, or `pnpm run check`, if the sandbox runner times out
  before output twice, stop retrying inside the sandbox and request approval to
  run the same read-only verification command outside the sandbox.
- For read-only verification commands that fail inside the sandbox with a
  read-only filesystem error against required tool state, such as
  `.git/worktrees` for Git worktree tests, `$HOME/.cache/uv` for
  `uv run --directory services/supervisor ...`, or managed-worktree pnpm temp
  files, do not change test scope or command shape. Record the sandbox boundary
  and request approval to rerun the exact same read-only verification command
  outside the sandbox.
- Verify direct tool availability before resolver scripts or package-manager
  indirection. Use `node --version`, `uv --version`, `pnpm --version`, or
  `uv run --directory services/supervisor python --version` before retrying
  `pnpm run ...`, Node resolver scripts, or Python readiness checks.
- Do not retry the same failed quoting shape. Simplify the command first.
- Use `sed`, `rg`, `git diff --stat`, or exact file reads for concise command
  evidence. Avoid formatting-heavy output when another command needs structured
  data.

## Tool Resolution and Verification

- First response checklist for environment or command failures:
  1. Confirm location with `pwd`.
  2. Check current diff scope with `git diff --stat` or
     `git diff --name-only`.
  3. Verify direct tool availability before resolver scripts, such as
     `node --version`, `uv --version`, `pnpm --version`, or
     `uv run --directory services/supervisor python --version`.
- Prefer `uv run --directory services/supervisor ...` for supervisor Python
  checks when the uv-managed environment is required.
- Keep verification scoped to the change. Run the smallest relevant check
  first, then broaden only when the touched code crosses package, API, or
  workflow boundaries.

## Token Economy and Progress Visibility

Use a quiet competent operator posture by default. Routine updates should be
short and should report the current phase, meaningful deltas, blockers, or the
next decision point. Do not repeat background context, restate an already agreed
plan, or narrate obvious command mechanics when nothing important changed.

When something important changes, explain it in plain English for the operator:

- What changed?
- Why does it matter?
- What happens next?

Token economy must not make automation invisible. Keep lightweight signs of
life during real work, especially during long-running tasks, but spend words on
state changes rather than ceremony.

Never compress away safety or steering information. Be explicit when work
touches approvals, destructive operations, source or evidence boundaries,
provider calls, paid usage, worker or process launch, GitHub delivery, cleanup,
failed checks, uncertainty, or a decision the operator needs to make.

If command or tool churn appears, stop blind retries and route to
`docs/workflows/tool-churn-rca.md`. Trigger that workflow when the same
command/tool path fails twice, when a sandbox runner timeout happens before
command output, when shell quoting/parser errors repeat, when a missing
tool/path or permission denial blocks progress, or when guidance already
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
- Treat BMAD-created work products as local Kendall planning state, not GitHub
  repo deliverables. PRDs, epics, stories, research packets, decision logs,
  handoffs, party-mode outputs, review notes, sprint plans, retrospectives, and
  similar BMAD-generated artifacts should stay in `_bmad-output/` or another
  ignored local workspace. If a decision from those artifacts belongs in the
  repo, rewrite it as source-owned docs, tests, scripts, or policy rather than
  tracking the generated artifact.
- Do not default to opening a PR for every small local improvement. Treat PRs
  as reviewable product or workflow delivery units that should be merged into
  `main`, such as user-visible features, safety/CI fixes, source-owned product
  docs or evidence, or changes that unblock another lane. BMAD-created stories,
  research packets, PRDs, epics, and handoffs remain local work products. Batch
  small helper fixes, test hardening, docs polish, and implementation prep
  locally until they form a coherent story-sized change or the operator
  explicitly asks for a PR.
- Use the matching BMAD-method skill for BMAD work instead of doing an
  informal shortcut. Before creating or changing epics, stories, PRDs,
  architecture notes, sprint plans, retrospectives, reviews, or BMAD-driven
  implementation artifacts, load and follow the relevant `bmad-*` skill and
  preserve its intended interactive checkpoints unless the operator explicitly asks for
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

When the operator starts or approves a long-running development goal, treat it as a
durable, milestone-driven workflow rather than a single unbounded task.

- Maintain durable goal state in repo artifacts when the goal is larger than a
  single story. Track current milestone, completed stories, next safe work,
  blockers, verification state, and open approval requests.
- Keep an authority ledger for any goal that may touch execution, provider
  calls, source mutation, Git/GitHub operations, worker launch, cleanup, merge,
  secrets, or retention policy. Approvals must name the authority family,
  operation, scope, and evidence. Generic "continue" language does not approve
  new authority.
- When an active long-running goal explicitly includes GitHub delivery actions,
  such as committing local changes, pushing the task branch, opening a PR,
  monitoring checks, merging the PR after checks are green, deleting the remote
  branch, or cleaning up the managed workspace, treat that goal text as the
  operator's standing approval for those named GitHub delivery operations within
  the current lane. This standing approval does not authorize unrelated
  repositories, unrelated branches, bypassing failed checks, force-push,
  destructive history rewrites, secret access, provider calls, cleanup outside
  the managed workspace, or expanding delivery beyond the reviewed lane scope.
  Record each delivery action and its evidence as part of the goal.
- Treat a PR merge under that standing approval as policy-approved low-risk
  delivery only when all of these are true: the PR belongs to the current lane,
  targets the expected base branch, is not a draft, is mergeable at the exact
  reviewed head SHA, has no failing required or reported checks, has no
  unresolved review threads or requested changes, has completed the relevant
  local verification, and the diff does not touch secrets, credential handling,
  provider calls, deployment/release automation, database/schema migrations,
  destructive cleanup, broad policy expansion, generated evidence retention, or
  other high-blast-radius surfaces. Record the PR URL, head SHA, base branch,
  check/review state, verification command, merge method, merge result, and
  rollback path before cleanup.
- Prove the low-risk delivery criteria with concrete evidence from GitHub PR
  metadata for base branch, mergeability, draft state, and exact head SHA;
  GitHub review-thread and review-request state for unresolved conversations or
  requested changes; GitHub status/check results for the exact head SHA; local
  verification command output for repo-specific checks; and a reviewed diff
  file list for excluded high-blast-radius surfaces. If a source is unavailable
  or ambiguous, the criterion is not proven.
- If GitHub reports a merge state such as `BLOCKED`, `UNKNOWN`, or otherwise
  refuses a merge while checks appear green, inspect thread-aware review state
  before any other hypothesis. Use the `github:gh-address-comments` workflow or
  its GraphQL review-thread fetch from the PR branch worktree; flat PR comments,
  `gh pr view` status summaries, and CI rollups are not sufficient evidence
  that review feedback is resolved.
- Reduce higher-risk merge candidates by adding evidence and controls before
  merge: split broad diffs into smaller PRs, keep the PR as draft until review
  is complete, require status checks/reviews/conversation resolution where the
  repository supports it, prefer exact-head merges or auto-merge/merge queue
  instead of bypassing branch protections, use feature flags or staged rollout
  for behavior changes, add a documented revert path, and rerun verification
  after base updates. If any high-risk surface remains, or if the merge tool
  reports missing/failing/ambiguous checks or reviews, stop for explicit
  operator approval.
- Use progressive authority for all automation: document intent and stop lines,
  add contracts first, preview/report, use fake adapters, dry-run real tools,
  move to read-only real integration, then bounded write integration, then
  human-approved execution, and only later policy-approved low-risk automation.
- If one lane or task is blocked waiting for operator approval, pause that specific
  lane/task and continue other safe unblocked work. Stop only when no meaningful
  safe work remains, unsafe behavior appears, scope expands beyond the approved
  goal, or the gated operation is the next unavoidable step.
- Treat refactoring and maintenance as valid goal work when it reduces
  fragmentation, removes obsolete prototype concepts, clarifies naming,
  improves Dev Console usability, stabilizes tests, fixes brittle scripts, or
  makes the pipeline safer. Keep these changes scoped and verified; avoid
  opportunistic repo-wide churn.
- If churn or repeated failures come from bugs, brittle tooling, misformatted
  commands, fragile scripts, unclear runbooks, flaky tests, shell quoting, or
  other preventable workflow errors, fix the root cause when safe and in scope
  rather than repeatedly working around it.
- Prefer one source of truth for state. Avoid parallel models for the same
  lifecycle. Make ownership clear for Candidate Work, WorkItem,
  ExecutionAttempt, events, evidence, and cleanup state.
- Do not make automation invisible. Automated actions must leave evidence:
  what ran, why it was allowed, authority level, input/output summary, result,
  next step, and recovery path.
- Keep the operator's attention focused. Interrupt only for decisions, approvals,
  blockers, failed checks, scope expansion, scarce paid/review resources, or
  unsafe behavior.
- For mutating automation, define recovery before or during implementation:
  resume, retry, rollback, inspect failure, preserve evidence, and cleanup.
- Preserve metadata and links, not raw prompts, completions, reasoning traces,
  provider payloads, secrets, or unnecessary source copies unless the operator
  explicitly approves that retention.
- Split large output into reviewable PR-sized milestones even if the same
  long-running goal continues afterward.
- Verify startup and environment assumptions as part of relevant milestones,
  especially when the work affects the supervisor, dashboard, tools, or
  PATH-sensitive commands.

## End-to-End Lane Runner

Use `docs/workflows/end-to-end-lane-runner.md` when the operator uses a short
delegation phrase such as "run end-to-end lane: <objective>", "develop this
through merge and cleanup", or "see this lane through end to end".

- Treat the default authority profile as `standard-delivery`: create or resume a
  managed worktree, research, use matching BMAD workflows and code review when
  useful, implement, verify, review, commit, push, open or update the PR, merge
  low-risk PRs, and clean up the merged local worktree, local branch, and remote
  lane branch when the evidence gates pass. BMAD party mode or spawned BMAD
  subagents are included automatically when useful for the lane and do not
  require separate per-lane approval when they run inside the current lane's
  existing agent/subagent execution context.
- Keep generated BMAD artifacts local. Rewrite durable decisions into
  source-owned docs, tests, scripts, or policy before delivery.
- Automatic BMAD party mode does not authorize new provider/model selection,
  explicit spend or budget changes, credential access, raw provider payload
  retention, external worker/process launch, or committing generated party-mode
  output without rewriting it into source-owned docs, tests, scripts, or policy.
- Do not interrupt for routine mechanics. Interrupt only for product steering,
  residual high-risk approval, failed checks that cannot be fixed within the
  lane, scope expansion, scarce paid or review resources, unsafe behavior, or
  external blockers.
- High-risk surfaces do not immediately require operator approval. First run a
  risk-reduction pass: split broad diffs, add exact-head checks, dry-runs,
  allowlists, explicit labels, narrow permissions, fake adapters, tests,
  rollback paths, or cleanup path guards. Ask the operator only when residual
  risk still exceeds the active authority profile or the mitigation itself needs
  new authority.
- Preserve an evidence packet for the lane: objective, authority profile,
  worktree, branch, PR, planning/review methods, changed files, verification,
  PR head SHA, check/review state, merge result, lane owner, ownership takeover
  if any, cleanup dry-run/result, and residual risks.

## Codex Workspace Protocol

Use the repo-owned Codex workspace workflow when the operator asks to start, list,
resume, finish, or clean up mobile/SSH Codex work. The deterministic command
surface is `node ./scripts/codex-workspace.mjs`.

- When the operator says "start a new task", "create a worktree", or similar, ask at
  most three quick clarifying questions only if the task intent, base branch,
  or PR-vs-experiment mode is unclear. Otherwise run
  `node ./scripts/codex-workspace.mjs start "<task description>"`.
  Use `--mode experiment` for scratch work that should not become a PR yet.
- When the operator says "list workspaces" or asks what Codex tasks are active, run
  `node ./scripts/codex-workspace.mjs list`.
- When the operator says "resume <task>", run
  `node ./scripts/codex-workspace.mjs resume "<task>"`, then use the reported
  worktree path for follow-up commands. If the manifest owner belongs to another
  runner, do not mutate that lane unless the operator confirms the other session
  is idle; only then pass `--take-ownership --takeover-reason "<reason>"` and
  record the previous owner.
- When the operator says "finish this as a PR", run the smallest relevant verification,
  then use `node ./scripts/codex-workspace.mjs finish-pr` from the task
  worktree or pass a task query from another worktree. Stage intended files
  explicitly before `finish-pr`; use `--stage-all` only after confirming the
  full worktree diff belongs to the task. Merge only when the active goal's
  standing delivery approval covers merge and the low-risk delivery criteria
  above are proven; otherwise wait for explicit merge approval after showing
  the PR state.
- Before merge, always perform a thread-aware review-comment check from the PR
  branch worktree. Do not treat a green check rollup or an empty flat comment
  list as proof that there are no unresolved review threads. Repeat this check
  after every PR head update or amend before merge; resolve only review threads
  that were actually addressed by code, docs, tests, or an explicit operator
  decision.
- When the operator says "clean up merged work", run
  `node ./scripts/codex-workspace.mjs cleanup-current --delete-remote` from
  inside the lane, or `node ./scripts/codex-workspace.mjs cleanup-merged
  "<query>" --delete-remote` from another worktree, first as a dry-run when the
  active authority is `standard-delivery`. The script must see a merged PR with
  the expected base branch, the current lane owner, and a clean or already
  removed target worktree before it removes anything. It must also verify that
  any local or remote lane branch still present matches the recorded PR delivery
  head before deletion. Re-run with `--apply --delete-remote` only when the
  dry-run output names the expected PR, owner, worktree, local branch, remote
  branch, and expected head. If cleanup previously stopped in
  `cleanup_partial`, rerun the same cleanup command from a stable worktree; the
  script should resume already-completed removal steps and close the manifest
  after verifying worktree, local branch, and remote branch absence.
- When local `codex/*` branches remain after workspace cleanup, run
  `node ./scripts/codex-workspace.mjs cleanup-branches` as a dry-run. The
  script may delete only local Codex branches that are already present in the
  base ref by ancestry or patch equivalence and are not checked out in any
  worktree. Preserve the dry-run output, selected base ref, skipped active
  worktrees, and final deletion summary as cleanup evidence. Re-run with
  `--apply` only when the dry-run output is correct.
- When the operator says "recover workspace state" or manifests appear stale, run
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
the operator explicitly approves a future workflow change.
