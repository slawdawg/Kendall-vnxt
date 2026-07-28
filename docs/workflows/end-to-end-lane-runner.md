# End-to-End Lane Runner

Date: 2026-06-23
Status: active guidance

## Purpose

Give the operator a short way to delegate a complete development lane while
preserving source boundaries, evidence, and approval safety. Use this workflow
when the operator wants to focus on ideas and features while Codex carries the
lane through research, planning, implementation, review, PR delivery, merge,
and local cleanup.

## Trigger Phrases

Treat these as an end-to-end lane request:

```text
run end-to-end lane: <objective>
develop this through merge and cleanup: <objective>
see this lane through end to end: <objective>
```

If the objective is clear enough to start safely, do not stop for ceremony.
Ask at most one concise question when the product goal, repository, base
branch, or PR-versus-experiment mode is ambiguous.

## Default Authority Profile

The default profile is `standard-delivery`.

It authorizes, for the named lane only:

- Create or resume a managed Codex worktree.
- Read source, docs, local planning state, and current external PR/check state.
- Run bounded research using primary or official sources when the decision
  depends on current tool, API, or ecosystem behavior.
- Use BMAD workflows and code review when the lane benefits from requirements,
  architecture, QA, or multi-perspective review.
- Use BMAD party mode or spawned BMAD subagents automatically when the lane
  benefits from multi-agent analysis, using the repository's configured
  provider/model defaults. The end-to-end lane request is standing approval to
  start bounded party-mode or subagent analysis without a separate operator
  approval prompt. Do not ask for lane-specific provider, model-selection,
  spending, or extra operator approval while the run stays inside the automatic
  allowance below.
- Create local BMAD planning artifacts under ignored local output folders.
- Rewrite durable decisions from local planning into source-owned docs, tests,
  scripts, or policy.
- Edit source, docs, tests, scripts, and workflow contracts within the lane.
- Run scoped verification, then broader checks when the changed surface
  requires it.
- Commit, push, open or update the lane PR, and address review or CI feedback.
- Merge low-risk PRs when the merge evidence checklist is satisfied.
- Clean up the merged local worktree, local lane branch, and remote lane branch
  after a valid dry run names only expected lane resources.

It does not authorize unrelated repositories, unrelated branches, force-push,
history rewrites, secret access, provider spending outside the bounded
party-mode allowance, production deploys, database or schema migration
execution, cleanup outside the managed lane, or remote branch deletion outside
the merged managed lane.

## Automatic Bounded Party-Mode Allowance

Under `standard-delivery`, BMAD party mode and spawned BMAD subagents are
pre-approved for automatic launch when they materially improve discovery,
planning, review, or verification for the named lane.

The operator has granted standing approval for this bounded automatic use. Do
not ask for additional operator approval merely because party mode or BMAD
subagents will run within the allowance below. Record the run in the lane
evidence packet instead of interrupting for approval.

The default allowance is:

- Use the repository's configured provider and model defaults. For Kendall_Nxt
  manager-control-plane work, the manager session, spawned subagents, BMAD
  party-mode reviewers, and worker helper agents should use `5.6 Luna` at
  `high` effort by default.
- Any platform-available GPT-5.6 model variant and every effort level it
  supports, plus `gpt-5.3-codex-spark` at its supported effort levels, are
  valid choices. Escalate above `high` effort or select a non-default model
  only for concrete higher-risk work,
  such as complex architecture, security-sensitive review, broad cross-module
  reasoning, unresolved failed verification, or a specific operator request.
  Record the selected variant, effort, and reason in the lane evidence.
- If the party-mode skill chooses a lighter configured model for a brief round,
  treat that as covered model selection.
- Run no more than one party-mode or subagent round per lane phase unless the
  next round is needed to address a concrete finding, failed verification, or
  unresolved design risk.
- Spawn only the agents needed for the lane decision, normally two to four
  BMAD agents per round.
- Keep generated BMAD artifacts local and retain summaries, file paths, issue
  lists, and verification evidence rather than raw prompts, reasoning traces,
  completions, or provider payloads.

Do not interrupt the operator merely because a party-mode run materially
improves discovery, planning, review, or verification and falls inside the
automatic allowance. If party mode would override the configured provider/model
defaults, exceed the allowance above, require missing
credentials, retain raw provider payloads, or combine with another high-risk
surface, skip party mode and continue with the normal single-agent lane flow
when that still satisfies the objective. Stop only when the lane objective
cannot be completed without expanded party-mode authority.

## Source-Change Admission

Before starting or resuming a lane, classify structured request facts without
mutating Git or workspace state. The admission result is metadata-only and has
one outcome:

- `read_only`: inspection or GitHub triage stays in **Understand**; do not
  create a branch, manifest, or worktree.
- `create_managed_lane`: a clear, authorized source change enters **Prepare**;
  preview or start it through `node ./scripts/codex-workspace.mjs start`.
- `resume_managed_lane`: a uniquely safe existing lane enters **Prepare**;
  inspect it through `node ./scripts/codex-workspace.mjs resume <task> --json`.
- `recovery_required`: an unmanaged dirty Base Checkout appears in **Needs
  attention**. Preserve the diff and inspect it only; do not stage, publish,
  reset, clean, move, or adopt it from this route.
- `decision_needed`: ambiguity, missing authority, or unsafe lane evidence
  appears in **Needs attention** until the named decision is resolved.

Routine clear source-change requests should move directly to the managed-lane
preview or resume route without an extra operator checkpoint. Admission never
falls back to in-place publishing and does not create a second lifecycle or
persisted board state.

### Managed-lane handoff

After admission, the handoff adapter consumes the completed result rather than
reclassifying the request. A `create_managed_lane` result invokes only
`codex-workspace start` for the previewed task, branch, worktree, manifest
state root, and owner; it then reads the resulting `resume --json` packet.
A `resume_managed_lane` result reads that owner-aware packet directly. The
worker may start only when the returned worktree exists, differs from the Base
Checkout, and exactly matches the admitted task, branch, manifest, and owner.
The handoff returns a structured `cwd`, not a shell `cd` command. It also
requires the active manifest and registered Git worktree to agree, and compares
resolved filesystem identity so a symlink to the Base Checkout cannot qualify.
For an existing manager-owned warm worker, the manager restarts that worker in
the validated `cwd` and confirms the pane path before delivering its handoff
pointer. The manager drift check permits that single `tmux respawn-pane -c`
operation only as this validated managed-CWD rebind; arbitrary respawns and
other destructive tmux controls remain rejected. Immediately after that rebind, the supported manager implementation
handoff compares the actual pane CWD by realpath/inode identity to the trusted
managed-lane evidence. It rejects the Base Checkout (including a symlink alias),
unknown CWDs, and mismatches before the source-edit handoff is delivered; the
returned route is to start or resume the named managed lane. A source-write
manager handoff without admitted managed-CWD evidence is rejected before its
pointer is delivered; read-only work bypasses this guard. This is an agent-path safeguard, not filesystem-wide
protection: it does not constrain the Operator's editor, manual shell, or an
arbitrary unwrapped local process. The Base Checkout is derived from Git's
primary-worktree metadata, and the selected entry must be non-detached and
match the admitted branch.

For `read_only`, `recovery_required`, and `decision_needed`, do not invoke a
workspace command. A failed start or unsafe resume result is a blocked handoff:
inspect the named `codex-workspace` route (and use its explicit takeover flow
when applicable), rather than inventing a branch, manifest, worker, or
publisher.

## Lane Lifecycle

1. **Start or resume lane.** Use `node ./scripts/codex-workspace.mjs` as the
   lifecycle authority. Record the worktree, branch, base, PR mode, current
   status, and lane owner.
   If `list`, `claim-next`, or `dispatch-next` reports malformed retained
   workspace manifests before a lane is selected, run
   `node ./scripts/codex-workspace.mjs repair-manifests --dry-run` from a clean
   checkout. Apply repair only when the plan is limited to closed legacy
   manifests and inert validation fields such as `worktree_path` or
   `base_branch`; stop for active, unreadable, or identity-missing manifests.
2. **Discover.** Inspect the smallest relevant docs and source first. Expand
   only when the objective crosses a product, architecture, safety, or external
   behavior boundary.
3. **Plan only as needed.** Use the matching BMAD skill for PRDs, epics,
   stories, architecture, UX, QA, research, or code review when the work
   benefits from that method. Use BMAD party mode or spawned BMAD subagents
   automatically when multi-agent analysis would improve the lane, staying
   within configured provider/model defaults and the bounded party-mode
   allowance.
   Keep generated BMAD work products local.
4. **Implement.** The owning worker or a delegated implementation subagent makes
   scoped source-owned changes. Prefer existing repository patterns over new
   abstractions; the manager session remains orchestration-only.
5. **Review.** Delegate implemented code changes through `bmad-code-review` to
   a manager-owned worker or bounded review subagent when the lane changes
   behavior, automation, or shared contracts. The manager records compact
   findings and routes fixes; it does not review the lane itself.
6. **Verify.** The owning worker or a delegated verification subagent runs the
   smallest meaningful check first, then broadens when the touched surface
   crosses packages, APIs, workflows, or user-facing behavior. The manager
   records the returned evidence without running the lane retest locally.
   If the branch has no source diff after a base refresh and scoped verification
   passes, classify it as a no-source refresh lane: preserve the evidence
   packet, do not create an empty PR, and close or clean up only through an
   explicit supported lifecycle path.
7. **Deliver PR.** A delegated delivery worker or subagent commits intended
   files, pushes the lane branch, opens or updates the PR, and monitors checks
   and review state. The manager records compact delivery evidence and does not
   execute these lane mutations in its own session.
   Before merge, run an independent delivery subagent audit for the exact PR
   head. Record only bounded metadata in `verify-pr-gates`: auditor id,
   `merge-ready`/hold status, exact head SHA, and a short summary. Do not make
   `codex-workspace.mjs` launch subagents, provider calls, or retain raw audit
   transcripts.
8. **Merge.** The delegated delivery worker merges only when the low-risk
   checklist is proven for the exact head SHA or when an explicit higher-risk
   approval covers the residual risk. The manager inspects the evidence and
   enforces the gate but does not merge from the manager session.
   If merge is blocked after checks are green, inspect thread-aware review
   threads before assuming branch policy, approval state, or GitHub lag. After
   every amend, force-with-lease push, or PR head update, repeat the
   thread-aware review-thread check before merge. As part of this delivery
   gate, the delegated worker may resolve only threads whose feedback has been
   addressed by the current diff, test evidence, or explicit operator
   decision. Record each resolved thread ID and its supporting evidence, then
   rerun the thread-aware check; any unaddressed or ambiguous thread remains a
   hold.
   Use exact-head merge protection for GitHub CLI merges, such as
   `gh pr merge <number> --merge --delete-branch --match-head-commit <headRefOid>`.
   For dependency or bot PRs outside a managed lane, verify in a temporary
   detached worktree from the PR head so dirty local work does not contaminate
   merge evidence.
   Use `doctor --summary-json` when automation needs a bounded readiness packet
   instead of human-readable doctor output.
9. **Cleanup.** The delegated delivery/cleanup worker should prefer
   `cleanup-current --delete-remote` from inside the lane,
   or `cleanup-merged <query> --delete-remote` from another worktree, as a dry
   run first. Add `--summary-json` when an automation runner needs the bounded
   cleanup-readiness packet instead of human-readable plan text. Apply cleanup
   only when the dry-run output names the expected PR, owner, worktree, local
   branch, remote branch, and delivery subagent audit for the current lane.
   If the PR is already merged but the manifest lacks verified merged metadata
   or a current `cleanup-ready` audit, run `reconcile-merged-pr <query>
   --summary-json` first. Its optional `--apply` records only locked,
   rechecked merged-PR metadata and an exact-head cleanup audit; it never
   deletes a worktree or branch, mutates a PR, or changes an assignment. Run a
   separate `cleanup-merged` dry run after reconciliation.
   Cleanup is resumable; if a previous attempt removed the worktree but stopped
   before branch deletion or manifest closure, rerun the same cleanup command
   from a stable worktree. When cleanup records `cleanup_partial`, inspect the
   manifest's metadata-only `cleanup_target_evidence` before retrying: every
   required worktree, local-branch, and requested remote-branch target must be
   `absent` before the manifest can close. A target left `present` or `unknown`
   is a stop line, not a successful closeout; fix that target and rerun the same
   exact cleanup command to refresh the evidence. If the partial attempt
   registered a remote branch through `--delete-remote`, preserve that flag on
   resume: the runner refuses to downgrade a still-present registered remote
   target and close the manifest while that branch remains.
   A no-PR lane that is not ancestral but was carried forward by a later merged
   PR must use `cleanup-superseded <task>` rather than `cleanup-integrated`.
   First review its `--summary-json` proof with the exact source head, merged
   carry-forward PR and integrated commit, and bounded scope. It compares full
   scoped tree entries, then repeats that proof under lock before a local-only
   apply. This path never deletes the remote source branch and never applies to
   a held workspace or a source lane with PR evidence.
   Orphan cleanup is for stale lane directories only; hidden workspace metadata
   under the worktrees root is outside the cleanup surface. Use
   `cleanup-orphans --summary-json` to inspect matched orphan directories before
   applying removal.
   For local codex branch cleanup, use `cleanup-branches --summary-json` to
   inspect safe and skipped branches before any delete apply.
   For assignment closeout, use `close-assignments --summary-json` to inspect
   eligible closed-workspace evidence before `--apply`.
   For closed legacy manifest repair, use `repair-manifests --summary-json` to
   inspect repairable and blocked manifests before `--apply`.
   For missing manifest rebuilds from existing Git worktrees, use
   `rebuild-index --summary-json` to inspect planned and skipped manifests
   before writing any index records.
   Stop if the worktree is dirty, no stable repository root is available, owner
   evidence is missing or mismatched, PR merge evidence is missing, or the
   local/remote branch head differs from the recorded PR delivery head.
   If cleanup is for stale remote branches outside a managed lane, first build
   an exact deletion set from current GitHub PR metadata and
   `node ./scripts/codex-workspace.mjs list --active --json`; use
   `list --summary-json` when automation needs bounded inventory counts before
   loading row-level JSON. Delete only
   branches whose current remote SHA exactly matches a merged PR `headRefOid`
   and that have no open PR, no closed-unmerged PR, and no active workspace
   owner.
   Use `start --dry-run --summary-json` when automation needs a bounded preview
   of a planned task id, branch, worktree, and manifest path before workspace
   creation.

## Best-Judgment Decision Evidence

When an autonomous lane runner makes a material best-judgment choice, record it
as metadata-only heartbeat evidence before continuing. Use `heartbeat <query>`
with `--decision`, `--decision-rationale`, and `--next-safe-action` so the
assignment or workspace manifest keeps the decision, owner, phase, current
command summary, result summary, and next bounded action without branch, PR,
cleanup, or ownership mutation.

Record this evidence when the runner continues through routine uncertainty,
chooses a supported fallback command, escalates or skips review within the
active allowance, enters a stop state, follows the tool-churn recovery path, or
handles cleanup or assignment-closeout mismatch evidence. Keep the retained
text to summaries only. Do not store raw prompts, reasoning traces, provider
payloads, secrets, credentials, or copied source content in best-judgment
decision evidence.

## Lane Ownership

Lane runners must treat the workspace manifest as the local ownership record.
`node ./scripts/codex-workspace.mjs start` records the current owner from
`--owner`, `CODEX_WORKSPACE_OWNER`, `CODEX_THREAD_ID`, or a local user/host
fallback. `list` and `resume` surface that owner.

Before resuming, finishing, merging, or cleaning up a lane, compare the
manifest owner with the current runner owner. If another owner is recorded,
stop and do not mutate the lane unless the operator confirms that the other
session is idle. Only then may the runner pass `--take-ownership` with
`--takeover-reason "<reason>"`, and the evidence packet must record the
previous owner and reason for takeover.

Unowned legacy manifests may be claimed by the first mutating runner, but new
end-to-end lanes should not remain unowned. Prefer setting
`CODEX_WORKSPACE_OWNER` to a stable, human-readable value when multiple Codex
sessions are expected.

`list --active`, `list --owned`, and `list --owner <id>` compose as strict AND
filters. Empty or placeholder owner values are not acceptable evidence for a
takeover or cleanup decision.

Use `resume --json` when an automation runner needs the matched worktree,
branch, owner, PR, and owner-warning evidence without parsing human text.

### Exceptional dirty in-lane takeover

A dirty lane remains blocked by default. Do not create a replacement worktree,
copy its changes, reset it, commit it, or use this route for a lane with a PR.
The only exception is an operator-authorized handoff of the *same* stale,
unpublished workspace manifest when its named dirty files are the intended
in-lane work.

First record a dry-run packet, then apply the same bounded request only after
the operator's approval is present:

```bash
node ./scripts/codex-workspace.mjs takeover <task-id> --dry-run \
  --takeover-reason "stale owner handoff reviewed" \
  --approval "operator approved bounded dirty in-lane takeover" \
  --allow-dirty-in-lane --dirty-paths "path/one,path/two"
```

The explicit path list is exact, not a glob. The runner rejects a missing,
unexpected, unsafe, unreadable, symlinked, renamed, copied, or out-of-worktree
path. It also rejects a non-stale or same owner, an active or retained task
lock, an absent worktree, a manifest/checkout branch mismatch, and any recorded
PR. Under the exact task lock it fingerprints every allowed file before and
after the transfer; a changed path or digest aborts without ownership mutation.

The applied manifest records the prior and new owner, reason, approval text,
timestamps, exact paths, status codes, and SHA-256 fingerprints. This route
does not perform GitHub actions, commits, resets, cleanup, or source mutation;
normal verification and delivery gates resume only after the ownership handoff.

## Parallel Suitability Report (Read Only)

Before considering more than one independent lane, obtain the manager refill
report from a clean `dev` checkout:

```bash
node ./scripts/manager-refill-plan.mjs --summary-json
```

The optional `summary.parallelSuitability` projection is an advisory,
metadata-only graph. Its versioned `ExecutionJob`, `ChangeSurface`, and
`ReservationLease` entries explain which source-ready candidates are selected,
deferred, or blocked. It records only identifiers, source/evidence references,
declared surfaces, ownership/worktree facts or absence reasons, baseline scope,
dependencies, and recovery actions.

Treat `selectedExecutionJobIds` as a bounded planning recommendation, not a
dispatch permission. The report never writes state-root records, manifests,
assignments, leases, locks, branches, or GitHub state; it cannot launch a
worker, call a provider, merge, or clean up. Existing `dispatch-next --apply`,
ownership/takeover, exact-head delivery, and cleanup gates remain the only
mutation boundaries.

`recommendation.capacity` is a compact, metadata-only capacity decision. With
current normalized `normal` resource and usage posture, it permits at most two
`read_write` entries, two valid immutable `read_only` entries, and four total.
Its `externalRouteAllowance` is always `0`: this report does not authorize a
provider route or call. Missing, unavailable, unknown, warm, or pressured
capacity evidence is `degraded`, with at most one writer and no read-only route
allowance. If normalized pressure is also an existing no-new-dispatch stop
line, the report is `blocked` and selects nothing. A `critical` resource
posture or an existing usage/dispatch stop line is likewise `blocked`; it
preserves all existing candidate,
ownership, assignment, delivery, and baseline blocks.

For a degraded or blocked capacity decision, refresh the existing normalized
resource and usage evidence and rebuild the report. Do not substitute raw host
output, infer normal capacity from absent evidence, or use a retry to dispatch,
launch a worker, call a provider, write a lease, merge, or clean up.

### Packet Detail Work Graph projection

The manager source-intake adapter converts one normal manager report entry only
when it has the deterministic authoritative packet mapping, then sends the
validated, redacted result only through the private manager-to-supervisor UDS
intake. The supervisor records it on that packet's `packet.created` lifecycle
event or an immutable `packet.parallel_work_graph_refreshed` event for a
new-key graph refresh.
The supervisor may expose one validated, redacted
`parallel-work-graph-evidence/v0` record for the matching packet and execution
job in **Packet Detail**. It projects only wave membership, dependency state,
reservation status/owner, capacity posture, reason, freshness, metadata-only
evidence refs, and one advisory recovery instruction. It is not a second
planner and does not change authority: the dashboard must render it as backend
truth and never recompute capacity, reservations, or dispatch eligibility.

The compact `/pipeline` card remains packet presence, name, and status only.
If the graph is stale, malformed, oversized, unavailable, or mismatched, the
supervisor returns the explicit unavailable detail state instead of a fallback.
Refresh the current manager report through its normal governed workflow; do not
copy its full payload, change-surface paths, worktree state, source/diff
content, prompts, credentials, provider data, or command output into Candidate
Work or browser-visible evidence. Candidate metadata and the public work-packet
endpoint are not graph import or replacement paths. The lifecycle-column migration is additive for SQLite and
PostgreSQL. For an application rollback, stop the new adapter and run the prior
application version; it ignores the nullable column without deleting or
rewriting evidence. A destructive schema rollback requires a separately
approved migration plan. The authenticated LAN Packet Detail uses the
same bounded data over the existing session-bound private UDS mediator.

A selected `read_only` entry is an **immutable review candidate**, not a review
result. It may appear beside a non-overlapping writer only when it carries a
full exact Git head, a `sha256:` digest, metadata-only source references, no
mutable worktree path, and a baseline that exactly matches that head. The dry
run does not call a provider, create findings, establish delivery eligibility,
or promote the candidate into a review request. Treat it as a bounded planning
fact only; a separately governed review workflow remains necessary before any
provider or delivery activity.

Interpret the output as follows:

- `selected` means the report found a bounded advisory wave under its current
  graph, baseline, and cap rules.
- `deferred` means a valid candidate must wait for the named coupling,
  overlap, baseline, or cap condition.
- `blocked` means source, ownership, delivery, authority, or immutable-review
  evidence is missing, stale, malformed, or unsafe.

For a blocked immutable review candidate, correct the exact reason (for
example, rebuild a stale or mismatched exact-head/digest snapshot, remove the
mutable worktree input, or replace malformed metadata) and re-run the dry run.
Do not use a re-run to infer a provider result or bypass the existing delivery
gates.

If a candidate is deferred or blocked, resolve its named reason and rebuild the
report from fresh source and assignment evidence. Common recovery actions are:

- Declare a narrow, source-proven, non-overlapping `ChangeSurface`; do not
  infer independence from a lane name or filename.
- Serialize shared contracts, dependencies, and operator-UX work until an
  explicit non-overlap proof exists.
- Preserve dirty, stale, foreign-owned, duplicate, authority-blocked, and
  open-delivery lanes under their existing workflow; do not use this report to
  take ownership or bypass delivery gates.

## Parallel Tmux Smoke Waves

When the operator asks to run multiple Codex workers in visible tmux sessions,
use a staged smoke wave before allowing a continuous loop.

The purpose of the smoke wave is to prove the control plane, not to hide six
independent autonomous delivery loops behind one opaque command. Each worker
session should be visible, named, owner-scoped, and limited to one lane loop
unless the operator explicitly expands the run.

Use session names and owners that match:

```text
codex-1
codex-2
codex-3
codex-4
codex-5
codex-6
```

Before launching workers:

- Verify the main `dev` checkout is clean.
- Push the current `dev` baseline when workers will open PRs against GitHub.
- Run `dispatch-next --dry-run --summary-json --readiness doctor` from `dev`
  and record the queue counts and first selected lane.
- Check for existing `codex-#` tmux sessions and do not overwrite an active
  operator-visible session.
- Decide whether the smoke wave is claim-only, one-loop delivery, or continuous
  loop. Default to one-loop delivery for the first run.
- Keep a local launch ledger with session name, owner, selected lane, worktree,
  branch, PR, status, and blocker summary.

Worker launch prompts must make the stop lines explicit:

- Set `CODEX_WORKSPACE_OWNER` to the matching `codex-#` value.
- Claim exactly one lane with `dispatch-next --apply`.
- Use the returned worktree and follow this end-to-end lane workflow.
- Merge is default-authorized for normal low-risk lane delivery, but only after
  exact-head, check, review-thread, and cleanup evidence is collected.
- Stop for secrets, credential changes, destructive migrations, unsafe provider
  or worker authority expansion, failed checks the worker cannot fix,
  unresolved requested changes, ambiguous exact-head merge state, unsafe
  cleanup, or scope outside the assigned lane.
- Do not claim a second lane during a smoke wave unless the operator explicitly
  expands the run to continuous mode.

If the platform or approval layer rejects launching multiple unsandboxed Codex
workers in one command, do not retry with a wrapper or workaround. Record the
rejection as an authority-boundary lesson and move to a safer launch plan:

1. Launch one tmux worker first and prove one complete loop.
2. Then launch the remaining workers individually or in smaller batches with
   the same prompt, ledger, and stop lines.
3. Keep merge, PR, cleanup, and provider authority visible in the launch
   command and evidence packet rather than relying on inherited chat context.

During the wave, the supervisor session should poll panes sparingly and record
state changes rather than streaming raw output. Relay only blockers, questions,
failed checks, PR links, merge results, cleanup results, and extreme-risk
findings to the operator.

## Low-Risk Merge Checklist

Merge under `standard-delivery` only when current evidence proves all of these:

- The PR belongs to the current lane and targets the expected base branch.
- The workspace manifest owner matches the current runner, or ownership was
  explicitly taken over with operator confirmation.
- The PR is not a draft.
- The PR is mergeable at the exact reviewed head SHA.
- Required and reported checks for that exact head are successful or
  intentionally skipped.
- Review threads are resolved and there are no requested changes or pending
  review requests. This must be proven with thread-aware review data, such as
  GraphQL `reviewThreads`; flat PR comments or check rollups are not enough.
  The evidence must be collected after the latest pushed PR head.
- Local verification has completed for the changed surface.
- The changed-file list avoids high-blast-radius surfaces.
- A rollback or revert path is known.
- For dependency/security bumps, the changed-file list is limited to the
  affected package metadata/lockfiles and focused local verification covers the
  package that changed.

If any evidence source is stale, unavailable, ambiguous, failing, or too narrow
for the changed surface, do not classify the merge as low risk.

## High-Risk Surfaces

These surfaces are not automatically covered by `standard-delivery`:

- Secrets, credentials, tokens, or authentication state.
- Provider calls, paid execution, model selection, or budget changes outside
  the bounded party-mode allowance.
- BMAD party mode or spawned BMAD subagents that override configured
  provider/model defaults, exceed the bounded party-mode allowance, escalate
  above `high` effort or select a non-default model without
  concrete lane risk, or retain raw provider payloads. These are not automatic;
  fall back to the normal lane flow unless the named objective requires expanded
  party-mode authority.
- Worker or process launch.
- Production deploys or release automation.
- Database, schema, migration, or retention changes.
- GitHub Actions or automation with write permissions.
- Review-thread mutation, branch protection changes, or merge automation.
- Destructive cleanup outside the managed lane.
- Lane ownership takeover without operator confirmation.
- Broad policy expansion or evidence-retention changes.

## Risk-Reduction Pass

Do not stop immediately when a high-risk surface appears. First attempt bounded
mitigation that can lower the residual risk without expanding authority.

Use controls such as:

- Split broad diffs into smaller PRs.
- Add exact-head checks before mutating PR or merge state.
- Add explicit labels, actor checks, allowlists, or narrow trigger conditions.
- Reduce GitHub workflow permissions to the smallest necessary scope.
- Use dry-run modes before write actions.
- Use fake adapters, fixtures, or replay before provider or worker execution.
- Add budget caps and explicit provider/model configuration before any paid
  path outside the bounded party-mode allowance.
- Add tests, static drift checks, or verification scripts for new contracts.
- Require clean-worktree, merged-PR, exact branch, owner, and path-allowlist
  evidence before cleanup.
- Use supported installed `gh` commands. Prefer `gh pr diff <number> --name-only`
  for changed-file discovery instead of relying on optional flags that may not
  exist on the installed CLI.
- For Python/uv verification, prefer repo wrappers with workspace-local cache
  configuration. If direct `uv run --directory services/supervisor ...` fails
  in the sandbox with a read-only `$HOME/.cache/uv` error, rerun the exact same
  read-only command outside the sandbox rather than changing command scope.
- If broad verification hangs or stops producing useful output, stop it
  cleanly, record it as inconclusive, and run focused verification that covers
  the changed surface.
- Prefer the merged PR `headRefOid` as cleanup head evidence when available;
  local manifest delivery-head metadata can be stale after follow-up PR commits,
  but local and remote branch deletion must still fail closed if either branch
  head differs from the merged PR head.
- Make cleanup resumable so already-removed worktrees or already-deleted
  branches are verified as absent and recorded instead of treated as blockers.
- Record rollback, revert, resume, retry, and inspection paths.

After mitigation, reassess residual risk. Continue only if the result satisfies
the active authority profile. Ask the operator only when residual risk still
crosses the approval threshold or mitigation itself needs new authority.

## Operator Interruptions

Interrupt the operator only for:

- Product or UX decisions that cannot be inferred safely.
- Approval for residual high-risk authority.
- Failed verification that cannot be fixed within the lane.
- Scope expansion beyond the named objective.
- Scarce paid, review, or runtime resources outside the bounded party-mode
  allowance only when the lane objective requires them and the normal lane flow
  cannot satisfy the request.
- Unsafe behavior, missing credentials, or external-state blockers.

Routine mechanics, command selection, context reads, local planning, test
selection, PR updates, and low-risk cleanup should continue without operator
attention while leaving concise evidence.

## Escalation Wording

Managed worktrees, Git operations, and GitHub delivery often require sandbox
escalation even when the lane authority is already settled. Under the
`standard-delivery` profile, requests to run `finish-pr`, push the lane branch,
or open/update the lane PR should cite the standing end-to-end lane authority
and the verification evidence. Do not phrase these as a fresh operator approval
for GitHub delivery unless the action exceeds the named lane, fails local
verification, or touches a high-risk surface.

## Evidence Packet

For each completed lane, preserve or report:

```text
End-to-End Lane Evidence
- Objective:
- Authority profile:
- Worktree:
- Branch:
- PR:
- Planning/review methods used:
- Changed-file list:
- Verification commands and results:
- PR head SHA:
- Check/review state:
- Merge method and result:
- Cleanup dry-run:
- Cleanup result:
- Lane owner:
- Ownership takeover, if any:
- Automatic party-mode use, if any:
- Party-mode allowance basis and retained evidence:
- Residual risks or follow-ups:
```

Do not retain raw prompts, completions, reasoning traces, provider payloads,
secrets, or unnecessary source copies unless the operator explicitly approves
that retention.
