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
| Legacy runtime scaffold | 64 files, ~11.3k lines | `runtime/`; last changed 2026-06-20. |
| Generated Codex compatibility tree | 1,002 tracked files | `.agents/skills`; temporary checked-in bundle per generated-artifacts policy. |
| Current managed worktrees | 25 | Workspace health baseline; each requires governed, evidence-based closeout rather than manual deletion. |

The figures are planning signals, not success targets. Line removal or test
removal without a proven replacement is not cleanup.

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
| `runtime/` | **decision resolved: abandon, archive/tag, then remove** | It is a separate personal-assistant scaffold; external references are documentation/readiness and not a code consumer. | Create an archival record/tag and a removal PR with clean-install proof. |
| `/pipeline/demo` and its fixture catalogue | **retain: supported, fixture-only daily-alpha flow; retirement decision needed only after authoritative supersession** | The [daily alpha runbook](../workflows/alpha-daily-use-runbook.md) directs use of `/pipeline/demo` for the explicitly labeled fixture catalogue, and the [fixture-fallback audit](../workflows/legacy-dashboard-fixture-fallback-audit-2026-07-17.md) says removing it would break the supported demo contract. It is not production evidence. | Record route/proxy callers and fixture boundaries. Do not mark retirement resolved or remove it unless a product decision explicitly supersedes both authorities and supplies removal plus rollback evidence. |
| Epic/story-specific report routes and panels | **classify then retire** | Many supervisor report routes serve readiness, maintenance, Git hygiene, or dated epic concerns. | Produce retained runtime / CLI diagnostic / archive / delete classification. |
| June gap reviews in navigation | **archive from current navigation** | Architecture index previously called dated reviews current. | Completed: index now labels them historical; retain documents for provenance. |
| `docs/ui.png` | **delete after final reachability check** | Repository text search found no reference. | Include only in a documentation-assets cleanup slice with rendering check. |
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
6. **Legacy runtime archival/removal.** It is isolated enough to be an early
   deletion slice once the archival record is created.
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
