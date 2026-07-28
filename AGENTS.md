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
- When a command hits a known sandbox, permission, process, or filesystem
  boundary, do not leave the learning as chat memory. Add or refresh the
  durable boundary rule before the next similar run, using the narrowest
  source-owned place that can prevent the repeat: this file for agent behavior,
  `docs/workflows/tool-churn-rca-examples.md` for concrete packets, or the
  project wrapper/preflight when code can skip the known-bad path. The desired
  future behavior is to avoid the known sandbox attempt entirely and route
  straight to the approved exact outside-sandbox/read-only path or documented
  skip, not to rediscover the same EPERM/EACCES/EROFS failure.
- Known boundary hits require a durable prevention step, not just a note. Before
  continuing similar work, either patch the wrapper/preflight/classifier so the
  known-bad sandbox path is skipped or routed first, add the command to the
  known-boundary registry below with an exact stop line, or record why the
  boundary is unavoidable and what source-owned check now detects it before the
  expensive/failing path runs. If the same known boundary is hit again after
  that, treat the prevention layer as defective work and fix that layer before
  retrying the original command.
- Known Kendall_Nxt sandbox-boundary commands:
  - Do not wrap manager scripts in node -e/spawnSync("node", ...) inside the
    sandbox to compact their JSON output. Nested Node process creation can hit
    the known spawnSync node EPERM boundary before the manager script itself
    runs. Use the direct manager command when sandbox-safe, or request the exact
    read-only outside-sandbox run for compact projection when child-process
    wrapping is needed.
  - `node ./scripts/manager-preflight.mjs --summary-json`: if Git, tmux,
    assignment, or local workspace probes hit EPERM/EACCES, stop sandbox retries
    and request the exact same read-only outside-sandbox rerun.
  - `node ./scripts/manager-cycle-packet.mjs --summary-json`: treat embedded
    manager probe EPERM/EACCES as a known sandbox boundary, not self-repair.
  - `node ./scripts/manager-run-loop.mjs --summary-json --once`: when
    preflight stops at `known_sandbox_boundary`, do not change scope or launch
    workers; collect the same read-only evidence through `manager-preflight` or
    `manager-cycle-packet` outside the sandbox before rerunning the loop.
  - `node ./scripts/manager-stale-owner-inspection.mjs --summary-json`: local
    workspace metadata inspection may need outside-sandbox read approval.
  - `node ./scripts/manager-cleanup-plan.mjs --summary-json`: fail closed on
    `sandbox_incomplete`; do not treat hidden workspace state as zero cleanup
    targets.
  - `node ./scripts/test-codex-workspace.mjs`: empty child stdout where JSON is
    expected is a sandbox/process boundary. The suite now self-skips when
    nested Node child processes are unavailable in the sandbox; run the exact
    same command outside the sandbox only when full CLI integration coverage is
    required.
  - `node ./scripts/run-manager-control-plane-shards.mjs ...` from a managed
    worktree under `.codex-workspaces`: manager tests create ignored BMAD
    fixture and worktree-local state. When the worktree is outside the sandbox
    writable root, do not run the shard in the sandbox first. Request approval
    for the exact focused shard outside the sandbox, especially after an
    `ENOENT`, `EROFS`, `EACCES`, or `EPERM` fixture/state write signature under
    `_bmad-output`, `.git/worktrees`, or managed-worktree temp state.
  - `pnpm run build:dashboard` and any broader verification command that routes
    to it, including `pnpm run check:changed` when dashboard files or full
    static checks are selected: the root build command now self-skips in the
    Codex sandbox before invoking Turbopack. Treat that skip as boundary
    evidence, not a failed build. Run the exact same command outside the
    sandbox only when full dashboard build coverage is required.
  - `pnpm run test:dashboard-pipeline-fixtures`: the nested import-boundary
    checker can hit a spawnSync EPERM/EACCES/EROFS sandbox boundary. The test
    emits the structured `SANDBOX_NESTED_PROCESS_BLOCKED` marker and skips only
    that subtest; treat the skip as boundary evidence, not full fixture
    coverage. Stop sandbox retries and run this exact command outside the
    sandbox for the complete 18-subtest result.
  - `pnpm run check:manager-control-plane` from a managed worktree may fail
    before invoking the check script with `[ERR_SQLITE_ERROR] unable to open
    database file` while pnpm prepares managed store state. Treat that as the
    known managed-worktree pnpm filesystem boundary; request approval to rerun
    the exact same read-only verification command outside the sandbox.
  - `pnpm install` or a workspace test that needs pnpm-managed temp state from
    a managed worktree may fail with `[EROFS]` while opening the worktree's
    `_tmp_*` file. Treat it as the same managed-worktree filesystem boundary;
    do not alter the lockfile or install scope, and request approval to rerun
    the exact command outside the sandbox.
  - `git fetch origin dev` (and other fetches that update `.git/FETCH_HEAD`)
    may fail with a read-only `.git` boundary in the Codex sandbox. Do not
    retry with a different fetch shape or mutate the checkout to work around
    it; request approval for the exact read-only fetch outside the sandbox.
  - Dashboard bridge integration tests that create Unix-domain sockets may
    fail with `listen EPERM` in the sandbox even when the test uses a private
    temporary path. Treat that as a sandbox process/socket boundary; request
    approval to rerun the exact test command outside the sandbox.
  - `ss -ltnp '( sport = :3000 )'` may fail with `Cannot open netlink socket:
    Operation not permitted` in the sandbox. Treat this as a socket-table
    visibility boundary; request approval for the exact read-only command
    outside the sandbox rather than inferring that no dashboard listener exists.
  - `tailscale ip -4` or `tailscale status --json` may fail to access
    `/var/run/tailscale/tailscaled.sock` with `connect: operation not
    permitted` in the sandbox. Treat this as a Tailscale LocalAPI visibility
    boundary; request approval for the exact read-only status command outside
    the sandbox rather than treating the daemon as stopped.
  - Local `curl` listener probes may fail with `failed to open socket:
    Operation not permitted` in the sandbox. Treat this as a local-network
    socket boundary; request approval for the exact read-only probe outside
    the sandbox rather than treating the target service as unreachable.
  - `gh auth status` may report the active token invalid inside the sandbox
    when the GitHub CLI cannot reach the operator's keychain-backed credential.
    Treat that result as a keychain visibility boundary, not proof that the
    token expired. Before requesting `gh auth login`, run the exact read-only
    `gh auth status` command outside the sandbox; use that result as the
    authoritative delivery-auth check.
  - `node ./scripts/codex-workspace.mjs finish-pr <task> --verify check` from
    a managed worktree: after a runner process disappears without a manifest
    result or bounded diagnostic while its exact owned lock was active, classify
    it as an external process-lifecycle/sandbox boundary. Do not retry or wrap
    the command in the sandbox. Request approval for the exact same governed
    command outside the sandbox, then run it once and preserve its normal
    verification, push, and PR evidence.
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

## Dashboard Dev Server Ports

- Treat port `3000` as the main cockpit/dashboard port. Main should always run
  there. Do not start an alternate `3001`, `3002`, or similar server when the
  operator expects the main cockpit to update on port `3000`.
- If main cockpit/dashboard code needs to refresh and port `3000` is already
  occupied by the existing main server, restart that server instead of starting
  a second server on a nearby port. The operator has granted standing authority
  to restart the Kendall web server for this purpose.
- For feature branches or managed worktree dev verification, do not use port
  `3000`. Use a stable explicit dev port outside the main cockpit port, such as
  `3102` for the current UI worktree, and keep reusing/restarting that same
  port for the lane instead of incrementing ports after conflicts.
- Feature/worktree dashboard dev servers may bind to `0.0.0.0` on their
  explicit non-3000 dev port so the operator can reach them from the host
  machine. State the bound address, port, and worktree in the update, and keep
  the server scoped to development verification.
- Before starting a dashboard dev server, identify whether the target is main
  cockpit (`3000`) or a feature/worktree lane (explicit non-3000 port). If the
  intended port is occupied, determine whether it is the matching server and
  restart it when appropriate rather than silently choosing a new port.

## Dashboard Browser Targets

- For dashboard UI verification, use the operator target matrix when the change
  touches layout, navigation, interaction, responsive behavior, or screenshots:
  Windows 11 desktop using Chromium, iPad Pro 2nd gen using Safari/WebKit iOS
  26, and iPhone 15 Pro Max using Safari/WebKit iOS 27.
- On Linux, approximate Safari targets with Playwright WebKit and the matching
  device viewport/user agent. Be explicit that this is a WebKit approximation,
  not a real iOS device run.
- If WebKit is unavailable because host libraries are missing, record the
  blocker and the install command needed for the operator to run rather than
  silently falling back to Chromium-only coverage.

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
tool/path or permission denial blocks progress, when a different wrapper command
fails for the same unresolved dependency, import, path, permission, sandbox, or
verification condition, or when guidance already identifies the attempted
command shape as known-bad. Use
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
- When the operator asks to review implemented lane work, that request is
  standing repo-level approval for the `bmad-code-review` workflow to run its
  required review subagents or party-mode reviewers without a separate
  subagent-specific approval prompt. Keep the run bounded to the reviewed lane,
  use configured provider/model defaults, retain only summaries/findings/paths
  and verification evidence, and stop before provider/model overrides, raw
  provider payload retention, paid-usage expansion, GitHub mutation, cleanup,
  worker launch, or any platform/tool policy that still requires explicit
  approval.
- Default Codex model routing for governed manager work is `5.6 Luna` at
  `high` effort for the manager/control-plane session, spawned subagents,
  BMAD party-mode reviewers, and worker helper agents. Any platform-available
  GPT-5.6 model variant, plus `gpt-5.3-codex-spark`, and every effort level
  supported by the selected model are valid routing choices. Escalate above
  `high`, or choose a non-default model, only when the lane has concrete
  higher-risk needs
  such as complex architecture, security-sensitive review, broad cross-module
  reasoning, unresolved failed verification, or a specific operator request.
  Record the selected variant, effort, and rationale for any non-default route
  in lane evidence. This default does not override platform availability,
  tenant policy, provider authentication, budget, or sandbox restrictions.
- The manager/control-plane session is orchestration-only for lane work. It must
  not implement source changes, run lane verification or retest loops, conduct
  code review, fix review-thread or CI findings, commit, push, open or update a
  PR, merge, or clean up the lane itself. Route implementation, verification,
  review, review-fix, and delivery/cleanup execution to the owning worker or a
  manager-owned worker/subagent first. Prefer existing manager-owned workers
  over API subagents so the work stays in the manager ledger and does not
  exhaust the separate subagent pool. The manager may inspect compact evidence,
  run dry-run/apply orchestration gates, dispatch or answer workers, and record
  verification and delivery evidence. A manager-local execution exception is
  allowed only after an explicit operator exception or when no worker/subagent
  delegation mechanism is available and all safe progress is blocked; record the
  exception, reason, touched files or operations, verification, and why waiting
  would block progress.
- Parallel development is the default for nontrivial epic work. At each phase,
  identify independent research, planning, implementation, verification,
  review, documentation, and delivery-preparation tracks, then dispatch them
  to separately owned managed lanes or workers when their write surfaces and
  contracts do not overlap. Do not serialize independent work merely for
  coordinator convenience.
- Serialize only true dependencies or overlapping/high-risk surfaces, including
  a shared contract or source file, migrations, authority/policy changes, and
  final delivery or cleanup. Record the dependency and actively dispatch newly
  unlocked work while other lanes wait for CI, review, or an external gate.
  Parallel lanes retain the same BMAD, review, authority, evidence, and
  delivery requirements; concurrency never permits a lane to bypass them.
- Every review workflow uses the durable default route: Claude Code read-only
  first, the exact approved local Ollama review route second when safely
  available, then internal BMAD review. Claude uses `claude -p` or an equivalent
  non-interactive read-only mode; tools are limited to file reads/searches and
  no edit, shell, network-expanding, secret, credential, browser profile,
  GitHub mutation, or filesystem mutation tools are allowed. The prompt names a
  bounded review scope. Do not impose a repository per-run dollar cap or pass
  `--max-budget-usd`; provider-account and platform controls still apply.
  A Claude unavailability, tenant/provider veto, scope rejection, empty result,
  or bounded failure records an explicit fallback reason before Ollama is
  considered. Ollama is eligible only with its exact approved endpoint/model,
  review approval, and sanitized path-scoped packet. Retained evidence is
  limited to summarized findings, file paths, line references, command metadata,
  route/fallback result, and verification results, not raw provider payloads,
  reasoning traces, secrets, or unnecessary source copies. This repo policy
  does not override system, tenant, provider, or sandbox policy; a veto falls
  through to the next approved route rather than being bypassed.

## Alpha Slice Operating Model

Kendall_Nxt is a pre-alpha project. When the operator asks to move faster or get
more done, interpret that as a request for more aggressive, smaller alpha slices,
not as permission to skip BMAD quality gates.

- Preserve the full BMAD-method workflow for meaningful product work: PRD,
  UX when UI or operator experience is involved, architecture, epics/stories,
  implementation readiness, sprint planning, story implementation, and review.
- Prefer narrow alpha slices that can move end to end quickly over broad
  planning lanes. A good slice should be dogfoodable in daily use, even if it
  is not production-complete.
- Make slices more aggressive by reducing scope, deferring polish, and choosing
  bounded functionality, not by weakening source boundaries, authority gates,
  evidence requirements, tests, or human approvals.
- When a capability has separable concerns, split them into independently
  shippable slices. For example, handle Git branch structure, tmux orientation,
  dashboard visualization, promotion packets, and GitHub protections as
  separate slices unless the operator explicitly asks for a combined lane.
- For each alpha slice, define the smallest useful outcome, the BMAD artifacts
  required for that slice, the verification needed to dogfood it, and the next
  slice it unlocks.
- Every new user-facing or operational feature must update a source-owned
  setup/runbook in the same slice and link it from the nearest README. Include
  prerequisites, configuration and startup, failure/recovery, and
  secret-handling boundaries so a new operator can get it running safely.
- Treat "pre-alpha" as permission to accept rough edges and fixture-backed or
  read-only starts, but not hidden mutation, unclear ownership, missing
  recovery paths, or undocumented authority expansion.
- If a slice is mostly backend/workflow behavior, do not force heavy UX work.
  If it changes `/pipeline`, cockpit, tmux orientation, operator wording, or
  daily workflow comprehension, run the UX workflow for that slice.

## Long-Running Dev Goals

### Operator Durable PR Delivery Authority

The operator has explicitly and durably authorized owning workers or delegated
subagents to commit intended lane files, push the lane branch, and open or
update a PR targeting the repository's `dev` branch for any Kendall_Nxt lane.
This authority is recorded at the repository-policy level and does not require
repeated lane-specific approval prompts after the worker has proven the normal
scope, verification, review, and delivery gates.

The authority does not permit manager-local source or delivery mutations,
force-pushes, bypassing failed checks or unresolved review threads, unrelated
repositories or base branches, secret/provider/deployment changes, destructive
history rewrites, or merge/cleanup actions unless separately covered by the
active goal and its evidence gates. A platform, tenant, provider, or sandbox
veto still takes precedence over this repository policy; workers must record
the veto and stop rather than retrying through a workaround.

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
  destructive history rewrites, secret access, provider calls outside the
  bounded end-to-end party-mode allowance, cleanup outside the managed
  workspace, or expanding delivery beyond the reviewed lane scope. Record each
  delivery action and its evidence as part of the goal.
- When using the end-to-end lane runner under `standard-delivery`, do not
  reframe `finish-pr`, PR creation/update, or routine PR push as a new
  operator approval request after local verification. If sandbox escalation is
  needed to run the command, state that the escalation is for filesystem,
  process, or network access and cite the standing lane authority. Stop only if
  the action exceeds the lane scope, touches a high-risk surface, or lacks the
  required verification evidence.
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
- For dependency or bot PRs, including Dependabot security bumps, verify in a
  temporary detached worktree from the PR head when the current checkout is
  dirty or unrelated. Use supported installed `gh` commands such as
  `gh pr diff <number> --name-only`, collect the exact `headRefOid`, run focused
  package verification, and merge only with exact-head protection such as
  `gh pr merge <number> --merge --delete-branch --match-head-commit <headRefOid>`.
  If a broad verification suite hangs or becomes inconclusive, record that
  result and run focused verification for the changed surface rather than
  treating the broad run as passed.
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

### Checkpoint Budget

Within an explicitly authorized lane, carry routine work through to its next
meaningful gate without requesting repeated confirmation for ordinary
inspection, scoped verification, review, or standard delivery steps. Batch
routine progress into concise state updates rather than stopping at ritual
workflow checkpoints. Interrupt only when an action changes the approved
authority or target scope, is destructive, requires human-only interaction,
encounters a failed or ambiguous gate, expands paid/provider use, or presents
a genuine product or safety decision. A previously granted lane authority
remains effective for its stated scope.

For BMAD work, preserve skill-required interactive checkpoints by default. The
operator may explicitly waive a named checkpoint as unnecessary for the current
lane only; that waiver never bypasses safety, authority, destructive-action, or
required external-approval gates.

When an active task gains source changes and the operator asks for delivery
through merge or cleanup—even if it did not start with an exact end-to-end-lane
trigger phrase—adopt the work into the existing `codex-workspace` lifecycle
before delivery. Use its managed-lane, `finish-pr`, exact-head merge, and
cleanup gates rather than manually recreating branch, PR, CI, merge, and
cleanup mechanics. If the current diff cannot be safely adopted, explain that
specific runner limitation once and request the smallest necessary direction;
do not silently fall back to a parallel ad-hoc delivery process.
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
  subagents are pre-approved to run automatically when they materially improve
  discovery, planning, review, or verification for the named lane, using
  configured provider/model defaults and the automatic party-mode allowance
  without lane-specific provider, model-selection, spending, or extra operator
  approval. Record the party-mode run purpose, agents used, allowance basis,
  retained evidence, and result in the lane evidence packet instead of
  interrupting for approval.
  For this repo, the configured default is `5.6 Luna` at `high` effort for
  the manager/control-plane session, spawned subagents, and BMAD party-mode
  reviewers. Any platform-available GPT-5.6 variant and its supported effort
  levels, plus `gpt-5.3-codex-spark` at its supported effort levels, remain
  selectable when concrete lane risk warrants a non-default route.
  The default allowance is one party-mode or subagent round per lane phase,
  normally two to four BMAD agents per round, with local artifact retention
  limited to summaries, paths, findings, and verification evidence rather than
  raw provider payloads. If a possible party-mode run would exceed the
  allowance, skip party mode and continue the normal lane flow unless the named
  objective requires expanded party-mode authority.
- Use a delivery subagent for standard-delivery evidence gates from now on
  unless no subagent tooling is available. The delivery subagent should inspect
  the exact PR head, changed-file scope, check status, thread-aware review
  state, merge-risk exclusions, cleanup plan, and evidence packet, then return
  a bounded merge/hold recommendation before the coordinator merges or cleans
  up the lane.
- Keep generated BMAD artifacts local. Rewrite durable decisions into
  source-owned docs, tests, scripts, or policy before delivery.
- Do not interrupt for routine mechanics. Interrupt only for product steering,
  residual high-risk approval, failed checks that cannot be fixed within the
  lane, scope expansion, scarce paid or review resources required by the named
  objective and outside the bounded party-mode allowance, unsafe behavior, or
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
  `node ./scripts/codex-workspace.mjs list`. Use
  `node ./scripts/codex-workspace.mjs list --active --json` when automation
  needs to correlate workspaces with GitHub PRs or remote branches.
- When the operator says "resume <task>", run
  `node ./scripts/codex-workspace.mjs resume "<task>"`, then use the reported
  worktree path for follow-up commands. If the manifest owner belongs to another
  runner, do not mutate that lane unless the operator confirms the other session
  is idle; only then pass `--take-ownership --takeover-reason "<reason>"` and
  record the previous owner.
- A dirty foreign-owned lane stays blocked by default. Use the exceptional
  `takeover --allow-dirty-in-lane --dirty-paths <exact,relative,paths>` route
  only after explicit operator approval is recorded in `--approval`, and only
  when its stale-owner, exact manifest/worktree/branch, no-PR, no-retained-lock,
  and stable path-fingerprint gates all pass. It transfers ownership evidence
  only; it must not commit, reset, clean up, copy files, or perform GitHub work.
- When the operator says "finish this as a PR", run the smallest relevant verification,
  then use `node ./scripts/codex-workspace.mjs finish-pr --verify scoped` from the task
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
- For stale remote branches outside a managed workspace cleanup path, first
  fetch and prune, then build an exact deletion set from current GitHub PR
  metadata and `node ./scripts/codex-workspace.mjs list --active --json`.
  Delete only branches whose current `origin/<branch>` SHA exactly matches a
  merged PR `headRefOid`, with no open PR, no closed-unmerged PR, and no active
  workspace owner. Preserve no-PR-record, SHA-mismatch, and active-workspace
  branches until separate inspection or explicit operator approval.
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
