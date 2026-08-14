# Kendall vNxt Cleanup Phase 0 Inventory

Date: 2026-08-13
Status: active baseline under the accepted holistic cleanup mandate
Scope: lifecycle convergence, retirement safety, CI/tooling, persistence,
documentation, and workspace metadata

## Purpose

This is the working inventory required by Phase 0 of
`kendall-vnxt-holistic-cleanup-program-2026-08-13.md`. It records the current
disposition, dependency evidence, and safe next action for each high-leverage
cleanup area. It is intentionally an index of focused migration slices, not a
second backlog or a promise to delete every listed path.

## Baseline

| Measure | Baseline | Source / interpretation |
| --- | ---: | --- |
| Root package scripts | 288 | `package.json`; 137 test and 67 check aliases dominate. |
| Supervisor application source | ~56.6k lines | `services/supervisor/src`; `application/service.py` is ~35.2k lines. |
| Supervisor test source | ~37.8k lines | `services/supervisor/tests`. |
| Manager/workspace scripts | ~121.6k lines | `scripts`; `manager-control-plane/core.mjs` is ~31.9k and `codex-workspace.mjs` is ~18.7k. |
| Root JavaScript tests | ~88.5k lines | `tests`; `manager-control-plane.test.mjs` is ~34.3k. |
| Legacy runtime scaffold | 64 files, ~11.3k lines; archived and removed in Phase 0 | `runtime/`; archive tag `archive/runtime-scaffold-2026-08-14` at `be068262`. |
| Generated Codex compatibility tree | 1,002 tracked files | `.agents/skills`; temporary checked-in bundle per generated-artifacts policy. |
| Current managed worktrees | 25 | Workspace health baseline; each requires governed, evidence-based closeout rather than manual deletion. |

The figures are planning signals, not success targets. Line removal or test
removal without a proven replacement is not cleanup.

## Dated evidence update — 2026-08-13

The following are completed read-only observations. They update the planning
baseline; they do not authorize schema, route, runtime, or workspace deletion.

- **Lifecycle:** canonical dashboard packet detail currently rejects
  `AuthoritativeWorkPacketLifecycleView` and then falls back to
  `/work-packets`. The first slice is a canonical detail projector with
  fallback only for legacy `work_item` and `candidate_work` identities. No
  schema or route deletion is in scope.
- **Retirement:** the documentation asset cleanup slice is limited to the
  asset and its two planning-record mentions, with documentation/render,
  reachability, clean-install, and `git revert` rollback evidence. `runtime/`
  requires archive/tag, then removal only after clean documentation, render,
  reachability, and clean-install proof. `/pipeline/demo` remains the
  supported, fixture-only daily-alpha flow.
- **Delivery, persistence, and workspace:** CI reporting/timing evidence must
  precede any topology or coverage change. Duplicate workspace stages are
  known, but neither may be removed without equivalence and timing proof.
  Persistence migration contract/inventory work is **blocked** by existing
  persistence PRs/lanes 796–798 and the shared database surface. The read-only
  workspace snapshot reports 26 clean active managed worktrees, 25 local-only
  commits, 5 PRs waiting for merge reconciliation, and 751 closed retained
  records; closeout must use governed tooling, never manual cleanup.
- **Routing record:** Sol/high was used for lifecycle (non-default because the
  canonical-detail rejection/fallback boundary requires an ownership decision
  before any route or schema change). Luna/medium was the default for the
  reachability and retirement evidence. Terra/high was used for delivery,
  persistence, and workspace evidence (non-default because the CI, shared-DB,
  and governed-workspace dependencies needed one cross-surface evidence
  packet before mutation).

### Runtime retirement evidence — 2026-08-14

The `runtime/` scaffold had no import, package, setup, or runtime code
consumer outside its own tree. Its only concrete external references were the
two mise/readiness documents, which were updated to describe the active
supervisor Python surface. Baseline documentation, authority, mise,
clean-install, and Linux-install checks passed before removal. The full
pre-removal tree is preserved by annotated tag
`archive/runtime-scaffold-2026-08-14` at `be068262`; rollback is a reviewed
revert of the removal PR or restoration from that tag under a new product
decision.

## Durable non-overlapping lane contracts

Each contract below is a bounded owner lock. A discovery of overlap or a new
cross-cutting decision stops mutation and returns the evidence to the central
coordinator for repartitioning.

### Lifecycle canonical-detail projector — Sol/high, non-default

- **Path ownership:** `apps/dashboard/src/lib/pipeline-supervisor-runtime.ts`,
  `apps/dashboard/src/components/pipeline/packet-detail-page.tsx`,
  `apps/dashboard/scripts/packet-detail-mediator.mjs`, and their focused tests
  only. The supervisor schema, routes, persistence models, and manager
  source-intake paths are not owned here.
- **Dependencies:** the authoritative lifecycle detail contract and the
  existing dashboard packet-loader/detail callers. Compatibility is limited
  to `work_item` and `candidate_work` identities.
- **Focused verification:** dashboard pipeline-boundary and packet-loader /
  packet-detail contract tests, followed by the coordinator's integration
  check.
- **Rollback:** revert the projector commit as one unit; no data or route
  rollback is permitted because this slice makes no schema or route change.
- **Allowed / prohibited:** change only the projector and its focused tests;
  do not delete or rename a route/schema, widen the fallback, or mutate
  supervisor persistence.

### Documentation asset cleanup — Luna/medium, default (completed)

- **Path ownership:** the documentation asset and its two exact planning-record
  mentions were owned together; both mentions were removed in the same slice.
  Unrelated documentation and assets remain outside this lane.
- **Dependencies:** planning-record references were distinguished from
  external or runtime reachability; no planning mention demonstrated an
  external or operational consumer.
- **Focused verification:** reference search, documentation/render checks, and
  clean-install checks passed before removal.
- **Rollback:** revert the asset-removal commit with `git revert`.
- **Allowed / prohibited:** this lane is closed; no product authority changed,
  and no unrelated documentation or asset was removed.

### Runtime archive/removal — Luna/medium, default (completed)

- **Path ownership:** `runtime/` and its archival/tag evidence only. The
  documentation-assets and demo-fixture lanes do not share this path.
- **Dependencies:** archive/tag first, then clean documentation, render,
  reachability, and clean-install proof.
- **Focused verification:** archive/reachability evidence plus the required
  documentation, readiness, Linux-install, and clean-install checks passed
  before the removal commit.
- **Rollback:** restore from `archive/runtime-scaffold-2026-08-14` or revert
  the removal PR; restoration requires a new product decision.
- **Allowed / prohibited:** this lane is closed; no non-runtime path was
  removed, and no source, CI, or product authority was changed.

### Supported demo fixture retention — Luna/medium, default

- **Path ownership:** `/pipeline/demo` route and its fixture catalogue are
  read-only in this phase; no writer lane is assigned.
- **Dependencies:** the daily-alpha runbook and fixture-fallback audit remain
  authoritative.
- **Focused verification:** record route/proxy callers and fixture boundaries
  without treating fixture output as production evidence.
- **Rollback:** no mutation means no rollback action; any future removal needs
  a new contract naming the superseding product authority.
- **Allowed / prohibited:** retain the supported fixture-only flow; do not
  delete, repurpose, or mark it retired in this lane.

### CI reporting and timing evidence — Terra/high, non-default

- **Path ownership:** read-only inspection of `.github/workflows/`,
  `package.json`, and the relevant CI/reporting scripts. No topology or
  coverage writer is assigned here.
- **Dependencies:** current CI entry points, job reports, timings, and the
  known duplicate workspace stages.
- **Focused verification:** capture current reporting and timing evidence and
  produce an equivalence/timing comparison before any topology or coverage
  proposal.
- **Rollback:** discard the evidence packet; no source rollback is needed
  because this lane is read-only.
- **Allowed / prohibited:** inventory and compare only; do not remove stages,
  reduce coverage, or change workflow topology without a separately approved
  implementation contract and proof.

### Persistence migration contract/inventory — Terra/high, blocked

- **Path ownership:** read-only inspection of
  `services/supervisor/src/supervisor/infrastructure/db/`, migration/schema
  code, and persistence tests. No migration writer is active.
- **Dependencies:** existing persistence PRs/lanes 796–798 and the shared
  database surface block this lane until the coordinator reconciles ownership.
- **Focused verification:** record the migration contract, current schema
  paths, callers, and the blocking PR/lane evidence; no migration execution.
- **Rollback:** none while blocked because no mutation is allowed.
- **Allowed / prohibited:** inventory and contract drafting only; do not edit
  migrations, `create_all`/startup mutation, schema models, shared DB code, or
  the blocked PRs/lanes.

### Governed workspace health and closeout — Terra/high, non-default

- **Path ownership:** read-only managed-worktree, assignment, lease, and PR
  reconciliation records; no direct filesystem cleanup or metadata writer.
- **Dependencies:** the 26/25/5/751 workspace snapshot and the repository's
  governed closeout tooling.
- **Focused verification:** refresh the health snapshot and reconcile only
  through the exact governed closeout path for an explicitly approved target.
- **Rollback:** use the closeout tool's documented restoration path; never
  repair state by hand.
- **Allowed / prohibited:** preserve dirty or retained records and use governed
  closeout; do not delete worktrees, branches, leases, or the 751 closed
  records with filesystem or manual metadata commands.

These locks are intentionally disjoint: dashboard detail, documentation
assets, runtime, demo fixtures, CI topology evidence, persistence, and
workspace metadata each have one owner. Integration or deletion authority is
not implied by an evidence-only contract.

## Lifecycle and contract inventory

| Item | Disposition | Evidence of current dependency | Required replacement / proof | First slice |
| --- | --- | --- | --- | --- |
| Supervisor lifecycle | **keep and make canonical** | Accepted ADR assigns it canonical ownership. | Target packet lifecycle contract and transition table. | Define contract/read model. |
| `/pipeline-control-plane/work-packets` | **keep and evolve** | Manager source intake and dashboard runtime use it. | Stable canonical response consumed without fallback. | Contract compatibility test. |
| `/work-packets` legacy route | **migrate then delete** | Dashboard proxy/loader, E2E, readiness scripts, and tests still call it. | No caller outside an explicit time-bounded adapter; persisted-data migration proof. | Create consumer inventory/test. |
| `WorkPacketV0` and V0 view contracts | **migrate then delete** | Shared contracts, dashboard fixture/loader code, pipeline control-plane tests, and readiness scripts rely on them. | Versioned canonical DTO and generated/shared client surface. | Target DTO proposal. |
| V0 action/approval models | **migrate then delete** | Pipeline lifecycle contract tests and supervisor API routes still exercise them. | Target server-bound approval model plus caller/data migration. | Route/model catalogue. |
| Manager mission/worker/event/checkpoint ledgers | **reduce to transient adapter state** | `scripts/lib/manager-control-plane/core.mjs` contains the parallel state surface. | Ownership table: supervisor-persisted versus worker-session-only data. | Field-level ownership inventory. |
| Dashboard canonical/legacy merge | **delete after migration** | `apps/dashboard/src/lib/pipeline-supervisor-runtime.ts` falls back from canonical responses to V0. | E2E assertion canonical data never reads legacy endpoint. | Dashboard runtime contract test. |

## Retirement and archive inventory

| Candidate | Disposition | Safety evidence | Next action |
| --- | --- | --- |
| `runtime/` | **archived/tagged then removed in Phase 0** | It is a separate personal-assistant scaffold; no setup, packaging, or runtime code consumer exists outside the tree. Archive tag `archive/runtime-scaffold-2026-08-14` preserves rollback. | Restore only through a new product decision and a reviewed PR from the archive tag. |
| `/pipeline/demo` and its fixture catalogue | **retain: supported, fixture-only daily-alpha flow; retirement decision needed only after authoritative supersession** | The [daily alpha runbook](../workflows/alpha-daily-use-runbook.md) directs use of `/pipeline/demo` for the explicitly labeled fixture catalogue, and the [fixture-fallback audit](../workflows/legacy-dashboard-fixture-fallback-audit-2026-07-17.md) says removing it would break the supported demo contract. It is not production evidence. | Record route/proxy callers and fixture boundaries. Do not mark retirement resolved or remove it unless a product decision explicitly supersedes both authorities and supplies removal plus rollback evidence. |
| Epic/story-specific report routes and panels | **classify then retire** | Many supervisor report routes serve readiness, maintenance, Git hygiene, or dated epic concerns. | Produce retained runtime / CLI diagnostic / archive / delete classification. |
| June gap reviews in navigation | **archive from current navigation** | Architecture index previously called dated reviews current. | Completed: index now labels them historical; retain documents for provenance. |
| `.agents/skills` | **migrate then untrack** | Current setup/docs/checks explicitly depend on it. | Pin generator and verify deterministic clean-clone regeneration; do not hand-edit/dedupe. |

## Safety and delivery inventory

| Area | Disposition | Current evidence | Next action |
| --- | --- | --- |
| Provider authority address | **P0 reconcile** | Current settings and newer workflow use one address; accepted checkpoint lists another. | Create a single authority-policy source and fail-closed drift test before provider-related simplification. |
| Database schema evolution | **P1 migrate** | Startup mutation plus `create_all`; SQLite/Postgres paths; no versioned migrations. | Adopt migration baseline after SQLite-default decision; retain Postgres only with active requirement. |
| CI post-merge coverage | **P1 simplify and correct** | Full workflow is push-to-`main`; active delivery branch is `dev`. | Add `dev` push, manual dispatch, and scheduled health entry points before reducing checks. |
| Verification scripts | **P2 consolidate** | `check` is a long serial chain; no root `test`/`lint` profile. | Map every command to `fast`, `affected`, `full`, `doctor`, or retired; preserve hook/workflow callers. |
| Supervisor reports | **P1 classify** | API includes development-readiness and epic-specific report endpoints. | Route/panel catalogue, including caller and durable operational signal. |
| Workspace/lease metadata | **P2 govern and reduce** | Multiple old clean local worktrees and one historical blocked lease are known. | Use workspace doctor and exact closeout tooling; do not hand-edit state or remove a worktree by filesystem command. |

## Ordered execution queue

1. **Authority policy record and drift test.** It is a stop-line correctness
   fix and does not require runtime enablement.
2. **Lifecycle target contract and ownership inventory.** It unlocks safe
   migration of the dashboard, manager, V0 routes, and associated tests.
3. **CI entry-point correction and profile inventory.** Establish accurate
   post-merge health before reducing verification.
4. **Database migration baseline on SQLite.** Preserve a supported upgrade path
   before removing lifecycle/schema compatibility code.
5. **Report/panel classification.** Move developer diagnostics out of product
   runtime in small, proven slices.
6. **Legacy runtime archival/removal.** **Completed:** archive tag created
   before the isolated removal slice; retain the tag as the rollback source.
7. **Demo fixture decision/removal.** Execute only after route/proxy inventory.
8. **Generated skills migration and workspace closeout.** These have their own
   governing contracts and proceed after deterministic regeneration/evidence.

## Phase 0 completion conditions

- Each row has a named replacement, deletion proof, or archive target.
- Lifecycle, authority, CI, and database migrations have an agreed target
  design and focused initial tests.
- No new V0 route/model, legacy fallback, one-off report route, or root command
  alias is added without an explicit short-lived compatibility record.
- The cleanup program and this inventory remain the current architecture
  navigation, while historical documents remain reachable for provenance.
