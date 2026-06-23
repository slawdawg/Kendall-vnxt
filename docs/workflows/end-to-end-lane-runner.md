# End-to-End Lane Runner

Date: 2026-06-21
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
- Use BMAD party mode or spawned BMAD subagents only when the operator has
  explicitly approved the provider, model-selection, and spending authority for
  that lane.
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
history rewrites, secret access, provider spending, production deploys,
database or schema migration execution, cleanup outside the managed lane, or
remote branch deletion outside the merged managed lane.

## Lane Lifecycle

1. **Start or resume lane.** Use `node ./scripts/codex-workspace.mjs` as the
   lifecycle authority. Record the worktree, branch, base, PR mode, current
   status, and lane owner.
2. **Discover.** Inspect the smallest relevant docs and source first. Expand
   only when the objective crosses a product, architecture, safety, or external
   behavior boundary.
3. **Plan only as needed.** Use the matching BMAD skill for PRDs, epics,
   stories, architecture, UX, QA, research, or code review when the work
   benefits from that method. Use BMAD party mode or spawned BMAD subagents
   only with explicit provider, model-selection, and spending approval. Keep
   generated BMAD work products local.
4. **Implement.** Make scoped source-owned changes. Prefer existing repository
   patterns over new abstractions.
5. **Review.** Route implemented code changes through `bmad-code-review` when a
   review is requested or when the lane changes behavior, automation, or
   shared contracts.
6. **Verify.** Run the smallest meaningful check first, then broaden when the
   touched surface crosses packages, APIs, workflows, or user-facing behavior.
7. **Deliver PR.** Commit intended files, push the lane branch, open or update
   the PR, and monitor checks and review state.
8. **Merge.** Merge only when the low-risk checklist is proven for the exact
   head SHA or when an explicit higher-risk approval covers the residual risk.
   If merge is blocked after checks are green, inspect thread-aware review
   threads before assuming branch policy, approval state, or GitHub lag. After
   every amend, force-with-lease push, or PR head update, repeat the
   thread-aware review-thread check before merge. Resolve only threads whose
   feedback has been addressed by the current diff, test evidence, or explicit
   operator decision.
9. **Cleanup.** Prefer `cleanup-current --delete-remote` from inside the lane,
   or `cleanup-merged <query> --delete-remote` from another worktree, as a dry
   run first. Apply cleanup only when the dry-run output names the expected PR,
   owner, worktree, local branch, and remote branch for the current lane.
   Cleanup is resumable; if a previous attempt removed the worktree but stopped
   before branch deletion or manifest closure, rerun the same cleanup command
   from a stable worktree.
   Stop if the worktree is dirty, no stable repository root is available, owner
   evidence is missing or mismatched, PR merge evidence is missing, or the
   local/remote branch head differs from the recorded PR delivery head.

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

If any evidence source is stale, unavailable, ambiguous, failing, or too narrow
for the changed surface, do not classify the merge as low risk.

## High-Risk Surfaces

These surfaces are not automatically covered by `standard-delivery`:

- Secrets, credentials, tokens, or authentication state.
- Provider calls, paid execution, model selection, or budget changes.
- BMAD party mode or spawned BMAD subagents that make provider calls or choose
  models.
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
  path.
- Add tests, static drift checks, or verification scripts for new contracts.
- Require clean-worktree, merged-PR, exact branch, owner, and path-allowlist
  evidence before cleanup.
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
- Scarce paid, review, or runtime resources.
- Unsafe behavior, missing credentials, or external-state blockers.

Routine mechanics, command selection, context reads, local planning, test
selection, PR updates, and low-risk cleanup should continue without operator
attention while leaving concise evidence.

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
- Residual risks or follow-ups:
```

Do not retain raw prompts, completions, reasoning traces, provider payloads,
secrets, or unnecessary source copies unless the operator explicitly approves
that retention.
