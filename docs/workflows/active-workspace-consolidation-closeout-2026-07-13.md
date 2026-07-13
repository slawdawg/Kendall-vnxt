# Active workspace consolidation closeout — 2026-07-13

## Scope and audit point

This source-owned record closes the workspace-consolidation audit that began
from `dev` at `aa283ed58be9b58cfe635128ba362790bd9cb304`. The remote and workspace
audit point was `2026-07-13T03:08:50Z` UTC. At that point:

- local `dev` and `origin/dev` both resolved to
  `aa283ed58be9b58cfe635128ba362790bd9cb304`;
- `node ./scripts/codex-workspace.mjs doctor --summary-json` reported
  `498/498` findings OK, zero warnings, and zero failures;
- GitHub reported no open pull requests and no remote `codex/*` branches;
- the only retained product-work lane was Story 4.6. The temporary docs-only
  lane used to deliver this record is not product work and must be removed
  after this document merges; and
- no application source, preserved ref, existing workspace manifest, Story
  4.6 file, or other lane was changed by this closeout delivery.

This record does not claim that Story 4.6 is complete. It also does not grant
authority for any Epic 25 live or production gate.

## Delivered PRs and post-merge cleanup

| PR | Delivered head | Merge commit on `dev` | Cleanup evidence |
| --- | --- | --- | --- |
| `#554` — Harden Epic 25 provenance and canonical consumption | `d96bf5aab4542d06c0e326b1264067b8761c9fc6` | `bfe5e44b0bee9c0f2424fccf0a3b4a462592ada1` | Workspace `20260713-epic-25-provenance-canonical-supervisor-hardenin` closed at `2026-07-13T02:30:47.210Z`; its worktree and local branch were removed. |
| `#555` — Prove Gate 4 BMAD dashboard integration | `76781cf7615c4b22c70938337438a291df15e7f6` | `aa283ed58be9b58cfe635128ba362790bd9cb304` | Workspace `20260712-gate-4-bmad-dashboard-proof` closed at `2026-07-13T02:30:47.916Z`; its worktree and local branch were removed. |

The two cleanup manifests record exact integrated heads and worktree/local
branch removal. Their remote-branch policy was `not-deleted-no-pr-integrated-cleanup`;
the live GitHub audit later proved that neither delivery branch, nor any other
remote `codex/*` branch, remained.

## Group A: eight governed stale lanes retired

The ignored preservation packet at
`_bmad-output/active-worktree-preservation-2026-07-12/bmad/` contains a
binary-capable `combined.patch`, `index.patch`, and `worktree.patch` per lane.
Before cleanup, each saved diff matched the live diff, every combined patch
passed reverse-apply validation, and no lane had untracked files.

| Retired lane | Lane head | Combined patch SHA-256 | Durable Git preservation |
| --- | --- | --- | --- |
| `20260704-bmad-1-2-lifecycle-transition-and-authority-rules` | `a61cd58eac11443daec37d9320606a0415726aea` | `d11f84f4572751106bd29dfb2d409fdb538e0b6852532c1d3696e408eb72e42b` | Special Git-object fallback described below. |
| `20260704-bmad-1-4-replayable-action-projection` | `a61cd58eac11443daec37d9320606a0415726aea` | `6ca9df3f84be78104bc00cd017ffe21e25b88afa510bb7df5afc19dfe3738dca` | Named stash commit `17414ab86b693472e485da572b9a03263336eb76`, message prefix `governed-stale-cleanup-group-a:`. |
| `20260704-bmad-2-2-adapter-contract-test-suite` | `a61cd58eac11443daec37d9320606a0415726aea` | `16c270ac1db8bf11e1fc79668569958f6b0318e13488851fd12e08dffe276de7` | Named stash commit `18223b9725e0d0017045b407b3bc6d320c1111e4`. |
| `20260705-bmad-2-3-runtime-readiness-and-operational-modes` | `f2dc635d32a3d39f373e402a67ecfd301916d3c9` | `23de19f131f03757cf08e4d563c145f7e4b30bf7495b35a4e21e98cf045498a0` | Named stash commit `d021257caed09853ab56f0559a22e3d90c512c78`. |
| `20260705-bmad-3-1-source-backed-packet-seed-and-eligibility` | `8112555a43cc034354522535d9e3e81152497572` | `7c44da0bb2f46034bd9c4592059a6e9d2a85028d18f8bc504f2ae1ace12b1f71` | Named stash commit `50cfafd8e68d73fb108a6e027d7279444f1ed2b8`. |
| `20260705-bmad-3-2-minimum-happy-path-operational-loop` | `3a0c11c217e74ea99757e8ce1ace7b853e8b436f` | `3b3dd98cd226d4627740d5adb9dcc233c4230cce07beb6057b924979e8b4618f` | Named stash commit `80f4cfbae947479f812fe894562225e16c282b17`. |
| `20260705-bmad-3-3-blocked-path-operational-proof` | `3a0c11c217e74ea99757e8ce1ace7b853e8b436f` | `5151733896a6eead41043e459b2641e6b16bd45cb60d7903c55d3c7a8961c4a1` | Named stash commit `ae2145cc6c9add2a8cbc6fae6aa00b416b8840fd`. |
| `20260705-bmad-4-1-operational-summary-and-capability-gated-action-projection` | `3a0c11c217e74ea99757e8ce1ace7b853e8b436f` | `6da2a6ca532531ecc09de70b2c6d5ee32aa9cc55f6d9eed9e27fbaa97d03f338` | Named stash commit `8f617686469e1fbb0454cb31a680814e014a1095`. |

The seven ordinary lanes were closed through `cleanup-integrated`; their
worktrees and local branches were removed, linked assignments and manifests
were closed, and no remote branch was deleted because none existed.

### Story 1.2 special preservation fallback

The ordinary stash path refused the dirty Story 1.2 index with
`operational-action-policy.runtime.json not uptodate`. Cleanup therefore
failed closed until a delegated state-only fallback had preserved and
revalidated all 10 dirty paths. The closed manifest records:

- raw index blob
  `refs/codex-preservation/20260704-bmad-1-2-lifecycle-transition-and-authority-rules/index-raw`
  -> `cc413863ba680d00084f0ec9ebbfc5b2e6b1737e`;
- index-tree commit
  `refs/codex-preservation/20260704-bmad-1-2-lifecycle-transition-and-authority-rules/index-tree`
  -> `8bab96e401ab8ef7a24ca74de11a3b857cdd054a`;
- worktree-tree commit
  `refs/codex-preservation/20260704-bmad-1-2-lifecycle-transition-and-authority-rules/worktree-tree`
  -> `318c587f3d968b67e588ebd1bcbd90fe87a1f277`; and
- regenerated tree `7417a8cae741c508a7fe8ed004898122933775ea`.

The raw ref is a Git blob and both tree refs are Git commits. All three refs
were re-read successfully during this audit. The manifest records byte
equivalence between the 10 dirty files and the regenerated tree, and confirms
that lane head `a61cd58e…` is an ancestor of `origin/dev`. Only after those
checks did the authorized fallback force-remove the worktree, delete the local
branch, and close the manifest at `2026-07-13T03:01:27Z`. No remote ref was
touched.

## Group B: five stale lanes retired

Each Group B dirty state remains a named stash commit. Cleanup then used the
supported integrated-workspace lifecycle against `origin/dev`, removing the
worktree and local branch and closing the manifest. No lane had a remote
branch to delete.

| Retired lane | Lane head | Named stash commit and exact changed paths | Closed at |
| --- | --- | --- | --- |
| `20260709-bmad-23-6-overnight-run-recovery-and-housekeeping` | `24bf976938e89166b2ab2f9f947bc26ba1ba073d` | `2a30e7ab92cd22644a88e8217369145606d82d18`; `scripts/lib/manager-control-plane/core.mjs` | `2026-07-13T02:48:56.413Z` |
| `20260710-fix-booting-promotion-review-remediation` | `3b1b742d00428d872eaec9409ae7a977c07944e5` | `f81887ca55c6e3def50a7d77746755761f9147c1`; `scripts/lib/manager-control-plane/core.mjs`, `tests/manager-control-plane.test.mjs` | `2026-07-13T02:48:56.907Z` |
| `20260710-fix-booting-promotion-second-review` | `3b1b742d00428d872eaec9409ae7a977c07944e5` | `8e43b8777202de9b95ab8a0492497696e015daaf`; `scripts/lib/manager-control-plane/core.mjs`, `tests/manager-control-plane.test.mjs` | `2026-07-13T02:48:57.412Z` |
| `20260710-fix-booting-warm-reviewer-promotion-worker` | `3b1b742d00428d872eaec9409ae7a977c07944e5` | `bd942cf22072ea0914d4a456df2b3309583ff349`; `scripts/lib/manager-control-plane/core.mjs`, `tests/manager-control-plane.test.mjs` | `2026-07-13T02:48:57.901Z` |
| `20260710-harden-manager-full-verification-fail-closed-ser` | `3b1b742d00428d872eaec9409ae7a977c07944e5` | `e59c0c6a92bb0fb08669260083edd243ba7ac5c1`; `package.json`, `scripts/check-manager-control-plane.mjs`, `scripts/lib/manager-control-plane-verification.mjs`, `scripts/run-manager-control-plane-shards.mjs`, `tests/manager-control-plane-verification.test.mjs` | `2026-07-13T02:48:58.403Z` |

All five stash subjects begin with the exact lane-qualified
`preserve:...:group-b-stale-cleanup:20260713` message. The stash objects were
re-read as Git commits during this audit.

## P0 and manager-adapter superseded-lane cleanup

PR `#554` superseded two older dirty lanes. Their deltas were preserved before
supported integrated cleanup:

| Retired lane | Integrated head | Durable stash commit | Preserved dirty paths | Cleanup |
| --- | --- | --- | --- | --- |
| `20260712-p0-epic-25-provenance-schema-hardening` | `6e29d9f9156ba9f5232e12e30c8e4d01afdcee04` | `3cee61021b8c674163b2723c5bb846ab1cf81f83` | `packages/contracts/src/pipeline-control-plane/index.ts`; `scripts/lib/manager-control-plane/operational-readiness.mjs`; `tests/operational-readiness-contract.test.mjs` | Worktree and local branch removed; manifest closed `2026-07-13T02:39:59.901Z`. |
| `20260712-manager-adapter-canonical-supervisor-fields` | `fa52d4c6ec234d5b00a82c248ba6c1137e0a5843` | `f49ac12d0a989b095d15d693951f6e57a1581408` | `scripts/lib/manager-control-plane/core.mjs`; `scripts/lib/manager-control-plane/manager-supervisor-source-intake.mjs`; `scripts/lib/manager-control-plane/operational-readiness.mjs`; `tests/manager-supervisor-source-intake.test.mjs` | Worktree and local branch removed; manifest closed `2026-07-13T02:40:04.726Z`. |

Their stash subjects use the exact suffix
`pr-554-superseded-cleanup:20260713`. The live remote audit found no matching
remote branches.

## Sole retained active product lane: Story 4.6

Workspace `20260713-story-4-6-supervisor-only-runtime-dashboard-sour` remains
active on branch `codex/story-4-6-supervisor-only-runtime-dashboard-sour`.
Its recorded owner is `019f5910-e8d1-7660-bc33-aca703ac0e0e`; the last
heartbeat was `2026-07-13T02:16:51.893Z`, phase `active`, with an 86,400-second
stale threshold. At the takeover audit its heartbeat age was 3,026 seconds,
so it was not stale.

A metadata-only takeover dry-run was refused. The blockers were exact and
intentional: the owner heartbeat was fresh, the worktree was dirty, and no
explicit takeover approval existed. The worktree and owner were left intact.

The lane is based at `bfe5e44b0bee9c0f2424fccf0a3b4a462592ada1`, three
commits behind current `origin/dev`, with no commits ahead and no PR. Its dirty
paths are:

- `AGENTS.md`;
- `apps/dashboard/src/app/pipeline/demo/page.tsx` (untracked);
- `apps/dashboard/src/app/pipeline/packets/[packetId]/page.tsx`;
- `apps/dashboard/src/components/pipeline/packet-detail-page.tsx`;
- `apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx`;
- `apps/dashboard/src/lib/pipeline-fixtures.ts`;
- `apps/dashboard/src/lib/pipeline-packet-loader.ts`;
- `apps/dashboard/src/lib/pipeline-supervisor-projector.ts` (untracked);
- `scripts/check-dashboard-pipeline-import-boundary.mjs`; and
- `tests/dashboard-pipeline-packet-loader.test.mjs`.

The partial loader test and import-boundary check pass read-only, but Story 4.6
is not done. In particular:

- **AC4 remains open:** an explicit demo list route and labeling are present,
  but demo detail isolation and proof that every demo action cannot invoke or
  satisfy live authority have not been completed and reviewed.
- **AC6 remains open as a delivery gate:** the current dirty boundary checker
  passes and reports separate normal/demo route graphs, but that proof is
  uncommitted, has not been reconciled with current `dev`, and has not passed
  the story's full focused regression/review/CI sequence.
- **AC7 remains open:** `tests/e2e/dashboard.spec.ts` has no lane diff. There is
  no browser proof for unique supervisor list/detail identity, refresh
  persistence, empty, unavailable, missing-detail, invalid/stale, explicit
  demo, or normal-mode fixture absence, and no recorded Chromium/WebKit run.

**Exact next owner action:** owner
`019f5910-e8d1-7660-bc33-aca703ac0e0e` must resume the existing Story 4.6
worktree, preserve and reconcile its 10-path dirty state onto current
`aa283ed58be9b58cfe635128ba362790bd9cb304`, complete AC4, revalidate AC6,
implement and run AC7 browser proof, then run the story's focused checks and
BMAD code review before committing or opening a PR. No other runner should
take over, clean, stash, rebase, or mutate that lane while its owner remains
fresh.

## Epic 25 external authority gates remain unexecuted

The source-owned Epic 25 contracts and local fixtures do not constitute live
or production evidence. This consolidation did not execute any of the
following external authority-gated operations:

1. the one-worker live canary, including approved substrate/provider use and
   live lease, checkpoint, telemetry, threshold, rollback, and cost evidence;
2. the staged live capacity ramp, normally `1 -> 2 -> 4 -> 6`, with observed
   queue, lease, latency, error, resource, usage, cost, halt, and rollback
   evidence;
3. live-path resilience and recovery drills for restart, worker death, stale
   lease, timeout, verification, pause/drain, handoff, and ownership recovery;
4. live-derived operational hardening and operator-run verification of alerts,
   secrets, resource/cost controls, rollback, incident/support, retention, and
   cleanup runbooks; or
5. a production readiness or rollout decision. With required live evidence
   absent, `hold` remains the only defensible disposition; no `go`, production
   rollout, unattended execution, provider call, external worker launch, or
   production mutation is authorized.

## Authoritative evidence paths

- Source-owned reconciliation baseline:
  `docs/workflows/phase-0-current-state-reconciliation-and-next-lane-authority-2026-07-11.md`.
- Source-owned stale-lane decisions:
  `docs/workflows/stale-lane-archival-reconciliation-2026-07-12.md` and
  `docs/workflows/bmad-stale-lane-archival-reconciliation-2026-07-12.md`.
- Epic 25 authority boundary:
  `docs/workflows/epic-25-retrospective-and-next-authority.md` and
  `docs/workflows/epic-25-pre-live-runbook.md`.
- Group A preservation:
  `_bmad-output/active-worktree-preservation-2026-07-12/bmad/preservation-evidence.md`
  and its per-lane patch directories.
- Closed workspace lifecycle evidence:
  `.codex-workspaces/slawdawg-kendall-vnxt/tasks/<task-id>.json` under the
  operator's workspace state root.
- Story 4.6 requirements:
  `_bmad-output/implementation-artifacts/4-6-supervisor-only-runtime-dashboard-source-boundary.md`.
- Durable Git state: the named stash commits and
  `refs/codex-preservation/20260704-bmad-1-2-lifecycle-transition-and-authority-rules/*`.
- Remote audit commands: `gh pr list --state open` and
  `gh api repos/slawdawg/Kendall-vnxt/git/matching-refs/heads/codex/`, both of
  which returned empty arrays at the audit point.

The `_bmad-output` and workspace-state paths are local evidence inputs, not
GitHub deliverables. This document is the durable source-owned consolidation
of the decisions and exact preservation identities they establish.

## Ordered next actions

1. Deliver and merge this docs-only closeout through the normal exact-head
   review/CI gates, then remove its managed worktree and local/remote branch.
2. Leave Story 4.6 with its current owner; the owner performs the exact action
   above and does not mark the story done until AC1-AC8, review, and delivery
   gates are met.
3. Re-run workspace doctor and GitHub open-PR/remote-branch inventory after
   Story 4.6 delivery or any workspace lifecycle change.
4. Keep Epic 25 live canary, ramp, recovery, hardening, and production gates
   on `hold` until fresh exact-target external authority and real observed
   evidence exist.
5. If such authority is later granted, execute gates in order: readiness,
   one-worker canary, staged ramp, recovery drills, hardening/runbook
   verification, and only then a production readiness decision.
