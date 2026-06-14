# Cleanup Automation Approval Packet

Date: 2026-06-14
Status: approval-required, non-executing packet
Authority family: `cleanup-automation`
Operation candidate: one bounded target-specific cleanup operation

## Purpose

This packet defines what must be approved before Kendall_Nxt may perform any cleanup operation that deletes or removes a local path, Git worktree, branch, filesystem residue, remote ref, or retained evidence. It builds on Story 10.3 cleanup planning and Story 12.2 post-merge cleanup evidence. It does not delete anything.

## Current Evidence Baseline

| Evidence | Current state |
| --- | --- |
| Story 10.3 | Done; read-only cleanup plan distinguishes Git worktrees, filesystem residue, source files, retained evidence, approved-root proof, and blocked paths. |
| Story 10.4 | Done; Dev Console shows delivery and cleanup plans without execution controls. |
| Story 12.2 | Done; PR #103 post-merge cleanup evidence recorded remote branch deletion/prune and confirmed no extra registered worktree existed. |
| Current cleanup automation | Blocked pending exact target-specific approval. |

## Candidate Operation

One future cleanup operation may be proposed if Bob accepts exact approval.

Allowed target types:

- One local Git-registered disposable worktree.
- One filesystem residue path proven to be inside an approved cleanup root.
- One local branch after merge/delivery evidence is retained.
- One remote branch/ref after merge/delivery evidence is retained.
- One bounded cache/temp/virtualenv residue set inside an approved disposable target.

Disallowed by default:

- Source checkout root deletion.
- Current repo root deletion.
- Main branch deletion.
- Retained evidence deletion.
- Unclassified filesystem paths.
- Ambiguous or unresolved paths.
- Cleanup outside approved roots.
- Cleanup based only on stale delivery evidence.

## Required Approval Binding

Any future cleanup execution evidence must bind:

- Authority family: `cleanup-automation`
- Operation: one bounded cleanup operation
- Target id
- Target type/classification
- Target absolute path or branch/ref
- Approved cleanup root
- Retained evidence references
- Delivery/merge evidence references
- Git worktree registration state
- Filesystem state
- Source file state
- Residue classification
- Blocked-path check result
- Dry-run effects
- Cleanup command or native operation shape
- Operator
- Approval timestamp
- Rollback/recovery path
- Stop lines
- Expiry or review point

Arbitrary, ambiguous, stale, expired, mismatched, or underspecified approval IDs must be rejected.

## Required Preconditions

Cleanup must remain blocked unless all applicable preconditions are true:

- Delivery/merge evidence is current and terminal.
- Retained evidence is preserved.
- Target classification is unambiguous.
- Target path is inside the approved cleanup root.
- Git worktree registration state is current.
- Source file state is safe.
- Blocked-path scan is clean.
- Dry-run effects are reviewed.
- Rollback/recovery path is documented.
- Approval is exact, current, and target-specific.

## Required Stop Lines

- Do not delete from this packet alone.
- Do not delete source checkout roots.
- Do not delete `main` or protected branches.
- Do not delete retained evidence unless separately approved.
- Do not delete ambiguous paths.
- Do not delete paths outside approved roots.
- Do not delete based on stale PR, merge, or worktree evidence.
- Do not use string-built shell deletion commands.
- Do not cross from local cleanup to remote cleanup without exact remote target approval.
- Do not bypass failed checks.

## Rollback And Recovery

Before cleanup:

- Preserve retained evidence.
- Capture dry-run effects.
- Capture target classification.
- Capture recovery path.

After cleanup, if later approved:

- Record result metadata.
- Preserve command/native operation shape.
- Preserve deleted target identifiers, not raw source copies.
- Preserve failure output summary if cleanup fails.
- Do not retry automatically without refreshed evidence.

If evidence is missing or stale:

- Leave the target untouched.
- Record metadata-only rejected cleanup evidence naming the missing gate.

## Exact Approval Template

`I approve the cleanup-automation lane for one bounded cleanup operation targeting <target-id>, target type <target-type>, target path/ref <target-path-or-ref>, approved cleanup root <approved-root>, retained evidence <retained-evidence>, delivery/merge evidence <delivery-evidence>, Git worktree state <git-worktree-state>, filesystem state <filesystem-state>, source file state <source-file-state>, residue classification <residue-classification>, blocked-path check <blocked-path-check>, dry-run effects <dry-run-effects>, cleanup operation shape <operation-shape>, operator <operator>, approval timestamp <approval-timestamp>, rollback/recovery path <rollback>, stop lines <stop-lines>, and expiry/review point <expiry>.`

## Verification

- `pnpm.cmd run check:docs`

If a later story changes cleanup contracts, supervisor service code, dashboard rendering, drift checks, or tests, it must also run the smallest relevant cleanup/delivery-readiness check and full `pnpm.cmd run check` before merge.

