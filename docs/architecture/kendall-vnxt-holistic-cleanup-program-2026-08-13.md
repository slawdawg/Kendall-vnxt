# Kendall vNxt Holistic Cleanup Program

Date: 2026-08-13
Status: accepted cleanup mandate; no runtime authority change
Scope: product simplification, technical-debt retirement, lifecycle convergence,
verification, documentation, and repository hygiene

## Purpose

This program is the source-owned plan for reducing accumulated Kendall vNxt
complexity without weakening the current authority, evidence, or recovery
boundaries. It is intentionally a correction program, not permission for a
repository-wide rewrite or deletion sweep.

On 2026-08-13 the operator approved this program as a standing cleanup mandate.
That approval authorizes ordinary implementation and repository-maintenance
actions required to complete the program without a per-slice operator
checkpoint. It does not expand runtime/product authority.

The target is a smaller pre-alpha control plane whose operator-visible path is
easy to explain:

1. the supervisor owns durable work-packet lifecycle and evidence;
2. the dashboard projects that truth and submits bounded requests;
3. manager, BMAD, workspace, and terminal components are adapters, not peer
   product ledgers; and
4. diagnostic and planning tooling does not masquerade as product runtime.

The accepted product authority and correction order remain governed by
`adr-current-product-slice-and-authority.md`. Nothing in this program enables
providers, worker launch, source mutation, delivery, merge, cleanup, or other
runtime authority.

## Assessment snapshot

The 2026-08-13 assessment combined repository inspection with an independent,
high-reasoning architecture review. The working tree was clean. Findings below
are separated into verified facts and planning inferences so that a cleanup
slice can be challenged or refined without silently changing product intent.

| Area | Verified condition | Cleanup implication |
| --- | --- | --- |
| Lifecycle ownership | The accepted ADR assigns canonical lifecycle truth to the supervisor, while the manager retains multiple mission/worker/event/checkpoint ledgers and the dashboard retains V0 fallback and merge behavior. | Converge on one lifecycle contract before retiring compatibility code. |
| API/contracts | Both legacy `/work-packets` and `/pipeline-control-plane/work-packets` are live; `WorkPacketV0` remains a real contract and has active consumers. | Treat V0 retirement as a migration with consumer and persisted-data proof, not a deletion task. |
| Supervisor | `application/service.py` is about 35k lines; `api/schemas.py` about 8k lines; the API exposes many report routes. | Split by bounded context and move development-only reports out of the runtime API. |
| Manager/workspace tooling | `manager-control-plane/core.mjs` is about 32k lines; `codex-workspace.mjs` and their primary tests are each about 19k–34k lines. | Separate durable policy from adapters, command parsing, filesystem work, and test fixtures. |
| Persistence | Startup code uses `create_all` plus dialect-specific schema mutation and many `ALTER TABLE` statements; no versioned migration tree exists. | Establish migrations before schema or lifecycle retirement. |
| Verification | The root package exposes 288 scripts; `check` is a very long serial chain; CI's full workflow is only triggered on `main`, while delivery uses `dev`. | Consolidate into profiles and make post-merge health visible on `dev`. |
| Old product surface | `runtime/` is a 64-file, roughly 11k-line Release 1 Outlook/scheduling/tasks scaffold with no meaningful code consumer outside its own tree. | Decide explicitly whether this is still a product. Archive/tag then remove it if it is abandoned. |
| Generated compatibility data | `.agents/skills` contains 1,002 tracked files and is explicitly a temporary compatibility bundle. | Migrate to deterministic generation before untracking; do not hand-delete or deduplicate it. |
| Documentation | The architecture index presents June gap reviews and planning-era materials as current navigation. | Keep a small current spine; archive historical reviews without losing durable decisions. |

The likely root cause is **era overlap**: legacy and authoritative lifecycle
APIs, V0/V1 contracts, fixture/readiness reporting, bespoke development
control-plane tooling, and the current supervisor-led product model coexist in
the same operator and repository surfaces.

## Non-negotiable guardrails

- Preserve the supervisor as the intended canonical lifecycle authority.
- Do not delete an API, persisted field, generated bundle, route, workflow, or
  document merely because it is old or large. Prove reachability, replacement,
  rollback, and ownership first.
- Do not expand runtime authority while simplifying implementation. The more
  restrictive documented authority applies whenever code and policy disagree.
- Preserve historical decisions through a concise archive/index; archive is not
  erasure.
- Keep each cleanup slice independently reviewable, reversible where practical,
  and covered by focused verification.

## Standing cleanup delegation

The operator authorizes the cleanup owner to perform the following when the
program's stated evidence and exit criteria are met:

- create, move, refactor, archive, and remove repository source, tests, docs,
  scripts, CI configuration, generated compatibility data, and obsolete assets;
- add, remove, or update development dependencies and execute required local
  verification;
- migrate contracts, APIs, database schemas, configuration, and test fixtures;
- create branches and commits, push scoped changes, and open or update pull
  requests through the repository's normal delivery policy;
- close stale local branches, worktrees, assignments, and lease metadata only
  through their governing tooling and only when that tooling's exact evidence
  gates pass; and
- make these cleanup defaults unless later source-owned product direction
  supersedes them:
  - the supervisor is the canonical lifecycle authority;
  - manager and dashboard retain adapter/projection state only;
  - V0 lifecycle/action APIs are migrated and then removed;
  - `runtime/` is abandoned unless an active roadmap consumer is demonstrated;
  - `/pipeline/demo` is a supported, explicitly fixture-only daily-alpha flow;
    retain that boundary unless an authoritative product decision supersedes the
    runbook and fixture-fallback audit; and
  - SQLite is the default persistence target unless PostgreSQL has an active,
    documented product requirement.

The cleanup owner follows the repository-wide
`docs/workflows/end-to-end-lane-runner.md` autonomous decision, recovery, and
delivery policy. An exact-head protected-branch merge is authorized when its
permanent bounded merge checklist is completely satisfied; it remains blocked
when any check, review, branch-protection, ownership, or evidence condition is
ambiguous. The owner must still stop for a materially new, irreversible, or
external consequence that no source-owned policy safely authorizes: enabling a
provider or paid service, using credentials, deploying to a live environment,
deleting real user data, changing the core product intent, or an authority
boundary that requires a separate exact-target approval. Any such stop is
recorded with the decision needed and the narrowest safe next action; it is not
a routine implementation checkpoint.

## Centralized parallel execution model

The cleanup program uses the current Codex session as a **central coordinator**
with bounded parallel worker lanes. It does not create a second Kendall runtime
or another persistent orchestration subsystem merely to clean this repository.
The central coordinator is the single owner of cleanup intent, ordering,
cross-cutting decision records, dispatch, and the durable evidence inventory in
`kendall-vnxt-cleanup-phase-0-inventory-2026-08-13.md`. It assigns every
repository mutation to an owning worker lane.

### Responsibilities

| Role | Owns | Must not do |
| --- | --- | --- |
| Central coordinator | Goal/phase state, dependency ordering, file-boundary assignment, lifecycle/authority/persistence decision records, worker dispatch, integration sequencing, delivery evidence, and residual-risk records. | Mutate source, documentation, workspace metadata, or routine hygiene directly; run verification or deliver a change itself. An assigned owning worker performs each of those actions. |
| Read-only analysis lane | Bounded discovery, reachability, test/log analysis, architecture review, and a concise evidence summary. | Edit repository files, alter workspace metadata, or make product decisions. |
| Isolated implementation lane | One approved, non-overlapping change slice in its assigned worktree and branch; focused tests and rollback notes. | Edit files outside its ownership boundary, push/merge another lane, or broaden product/runtime authority. |
| Integration/review lane | Diff review, contract/regression checks, CI evidence, and review-thread remediation. | Reinterpret an unapproved product decision or silently repair a conflicting lane by discarding its work. |

### Model and lane allocation

Use the strongest reasoning where ambiguity and cross-cutting ownership are
highest, and faster models for narrow evidence work:

| Work shape | Preferred lane configuration |
| --- | --- |
| Lifecycle ownership, authority policy, persistence design, or major architectural tradeoff | Sol with high or xhigh reasoning; central coordinator retains the decision. |
| CI/tooling, report/panel inventory, dependency mapping, test-log analysis, or broad code exploration | Terra with high reasoning; return evidence and a bounded implementation proposal. |
| Mechanical reachability searches, documentation/reference inventories, fixture catalogues, or repeatable verification classification | Luna with medium reasoning; return structured results only. |

The coordinator selects the number of lanes from the session's available
capacity. Parallelism is a throughput tool, not a goal: a lane is not started
until its input, file ownership, output, and integration dependency are clear.
The table is the default model and effort selection. For every lane routed away
from its applicable default, the coordinator records the selected model variant,
reasoning effort, and concise rationale in the Phase 0 inventory or linked PR
description before dispatch; this makes non-default routing reviewable rather
than implicit.

### Execution waves

1. **Reconnaissance wave — parallel, read-only.** Run independent lanes for
   lifecycle consumers, report/panel classification, CI/script topology,
   persistence inventory, and retirement reachability. Each returns a concise
   evidence packet rather than raw command logs.
2. **Partition wave — centralized.** The coordinator converts those findings
   into small slices with one owner, exact path/module boundaries, verification,
   rollback, dependencies, and expected delivery order.
3. **Implementation wave — parallel only where isolated.** Independent slices
   use separate governed worktrees and branches. Good candidates include a
   CI-entry-point fix, an isolated archive/removal, or a report-to-CLI move.
   Agents must not concurrently edit the same contract, lifecycle module,
   database schema, package manifest, workflow, or documentation index.
4. **Integration wave — centralized sequencing with owned execution.** The
   coordinator reviews each lane's evidence, resolves conflicts, and assigns
   one integration worker to run cross-slice tests, update the inventory, and
   deliver the narrowest safe PR(s). The coordinator does not mutate source,
   run verification, or deliver changes directly. Review remediation follows
   the same ownership model.
5. **Repeat from evidence.** New findings become a subsequent bounded wave;
   they do not expand an in-flight lane by default.

### Serial boundaries

The following require one coordinated owner and must not have concurrent writer
lanes: authority-policy source of truth, canonical lifecycle contract and its
cross-language clients, database migration baseline and migrations, shared
package manifests/lockfiles, CI workflow restructuring, and final integration
or merge. These boundaries are where speed from parallel edits is outweighed by
split truth, merge conflict, or invalid migration risk.

### Lane contract

Before an implementation lane begins, the coordinator records in the Phase 0
inventory or linked PR description:

- objective and exact file/module ownership;
- base revision, worktree, branch, and lane owner;
- allowed and prohibited operations, including authority stop-lines;
- required focused checks and the integration check;
- rollback or restoration path;
- upstream dependencies and downstream consumers; and
- for a non-default model route, the selected model variant, reasoning effort,
  and rationale; and
- expected output: evidence only, a commit, a draft PR, or a merged cleanup.

If a lane discovers overlap or a new cross-cutting decision, it stops mutation,
returns the evidence, and the coordinator repartitions the work. This is normal
coordination, not an operator checkpoint.

### Operating controls

These controls make the parallel model enforceable without creating a separate
cleanup service or a second backlog system.

#### Work in progress limits

At any time there is one central coordinator, at most two active writer lanes,
and only as many read-only lanes as the remaining session capacity permits.
Writer capacity is intentionally scarce: a completed, integrated slice creates
more throughput than a large queue of conflicting diffs. A new writer does not
start until the coordinator records its lane contract and confirms it has no
active ownership conflict.

#### Definition of ready and done

A slice is **ready** only when it has a specific behavior/deletion outcome,
exact owner paths, base revision, dependencies, required checks, rollback path,
and authority classification. It is **done** only when its focused checks pass,
the integration check passes, its consumer/migration/deletion proof is attached,
the inventory is updated, and its intended commit or PR state is recorded.
Passing a unit test, reducing line count, or creating a plan does not by itself
make a cleanup slice done.

#### Ownership locks and integration queue

The coordinator records active writer ownership as path/module prefixes in the
Phase 0 inventory. No two writer lanes may own the same shared contract,
migration, package manifest/lockfile, CI workflow, documentation index, or
lifecycle boundary. Completed lanes enter a sequential integration queue: the
coordinator reviews the diff and evidence, then assigns one integration worker
to run cross-slice verification, update the inventory, and deliver or return
the lane for correction. The coordinator records sequencing and evidence only;
the queue admits one integration worker at a time.

#### Health snapshots and quality ratchets

At the start and end of each execution wave, record a concise health snapshot:
base-branch freshness, managed worktree/lease state, open PR/review-thread
state, relevant CI status and duration, focused-test result, and the legacy
consumer count for the affected surface. The following regressions are blocked
unless a short-lived compatibility record names an owner, removal condition,
and expiry:

- a new V0 API, model, or dashboard fallback;
- a new epic/story-specific product route or report panel;
- a new root script alias outside the verification-profile design;
- a duplicated lifecycle enum or hand-maintained cross-language parity copy;
- a new startup schema mutation instead of a versioned migration; or
- a new generated or machine-local tree tracked without a reproducible source.

#### Deletion protocol

Every retirement follows the same narrow sequence:

1. record whether the target is archive, migrate-then-delete, or direct delete;
2. preserve the durable decision or tag/archive reference when history matters;
3. prove callers, setup paths, generated outputs, persisted data, and runtime
   consumers are absent or migrated;
4. remove the target and its tests/fixtures/configuration together when they
   are a single feature surface;
5. run targeted and clean-install verification; and
6. record the deletion and restoration reference in the inventory/PR.

No deletion is approved by age, size, stale branch metadata, or a passing grep
alone.

#### Time, budget, and decision discipline

Each lane has a bounded work budget and a concrete output. If it exceeds the
budget, finds broad overlap, or encounters a cross-cutting decision, it returns
its evidence to the coordinator rather than silently broadening scope. The
coordinator keeps a short decision log in the existing cleanup inventory or
linked ADR/PR: only architectural or irreversible decisions, their rationale,
and the implementation link. This preserves context without creating another
planning database.

#### Autonomous hygiene and wave reporting

At the start and end of each wave, the coordinator runs the relevant read-only
workspace, branch, PR, CI, and review-state inventory. It dispatches routine
cleanup work to the owning worker, which uses the governing
tools; the coordinator records the returned evidence. An owning worker retries
one demonstrated transient verification failure and opens a bounded follow-up
only for a supported, evidence-backed candidate. The coordinator records a
concise scorecard rather than asking
the operator to interpret routine green state: base freshness, active lanes,
PR/review state, CI duration/health, legacy-surface counts, recoveries, and
true stop-class blockers.

### Speed rules

- Parallelize read-heavy exploration, triage, test analysis, reachability, and
  genuinely isolated changes.
- Keep lifecycle migration, authority correction, schema changes, shared
  contract changes, and integration sequential.
- Prefer several small PRs with non-overlapping ownership over one large
  cleanup branch.
- Do not build a new repository orchestration layer to coordinate cleanup; use
  the existing Codex session, governed worktrees, the cleanup inventory, and
  concise lane evidence.
- Treat a clean integration path and reproducible verification as throughput:
  rework and conflict resolution are slower than a short centralized partition
  pass.

## Prioritized correction register

### P0 — converge lifecycle truth

**Verified.** The current ADR requires supervisor-owned lifecycle truth, but
the manager's core retains parallel ledgers and its own README still labels the
area `backend_proof`. The dashboard reads the pipeline-control-plane endpoint,
rejects non-V0-shaped responses, then falls back to and merges legacy
`/work-packets` data. Both route families and V0 contracts are exercised by
dashboard, manager, scripts, and tests.

**Decision.** Define one versioned authoritative packet/read-model contract
that represents the supervisor lifecycle. `CandidateWork` may remain intake and
`ExecutionAttempt` may remain evidence, but peer lifecycle truth must be
eliminated or made explicitly transient.

**Migration sequence.**

1. Publish the target contract, transition table, ownership table, and external
   consumer inventory.
2. Add a supervisor read model that satisfies the target contract without a
   dashboard fallback.
3. Migrate dashboard list, detail, and action requests; prove that a nonempty
   canonical response does not touch a legacy endpoint.
4. Reduce manager state to adapter/session metadata and supervisor references.
5. Migrate persisted records and all callers; add removal telemetry or a
   bounded compatibility report if a live installation exists.
6. Remove legacy routes, `WorkPacketV0`, fallback/merge code, parity checks,
   and obsolete fixtures in one or more tightly scoped deletion PRs.

**Exit proof.** One contract test suite, a supervisor migration test from each
supported prior schema, dashboard E2E proof, and repository search with no
legacy consumer other than an explicitly time-bounded compatibility adapter.

### P0 — reconcile authority-policy drift

**Verified.** The current settings and newer workflow documentation identify
one local provider source address, while an accepted approval-checkpoint record
names a different exact address. Exact targets are duplicated across code,
fixtures, policies, and documentation.

**Decision.** Treat this as a stop-line discrepancy until a reviewed,
source-owned authority record supersedes the older value. Decide explicitly
whether providers are disabled by default; never infer enablement from a
historical setting.

**Implementation direction.** Create a single versioned authority-policy
artifact, consume it from validation/adapters, and generate or verify the
language-specific representations. Delete duplicated literals only after the
artifact is the enforced source of truth.

**Exit proof.** A target-bound approval test, code/document drift check, and a
negative test demonstrating that either unapproved address fails closed.

### P1 — make persistence evolvable

**Verified.** Supervisor database startup combines `create_all` and
dialect-specific DDL mutation. SQLite and Postgres paths are both represented,
but migrations are not versioned.

**Accepted default.** Use SQLite unless an active, documented PostgreSQL
requirement is found. Record that exception evidence before supporting both;
dual support doubles migration and concurrency proof obligations.

**Plan.** Baseline the current schema with a versioned migration tool, supply
representative old-database fixtures, prove upgrade and rollback behavior, then
delete startup mutation code incrementally.

**Exit proof.** Clean-install, upgrade, rollback, and data-preservation tests
for every supported database path.

### P1 — separate product runtime from development diagnostics

**Verified.** The supervisor has a large report surface, including many
maintenance, readiness, documentation, Git hygiene, and Epic-specific report
routes; the dashboard includes corresponding status panels.

**Disposition rule.** Every report must be classified as one of:

- retained runtime-operational signal;
- developer diagnostic moved to a CLI/doctor profile;
- durable decision rewritten into a concise document; or
- historical/epic-specific surface removed.

Do not expose a development report in a product API merely because it is useful
to repository maintainers.

### P1 — re-evaluate bespoke orchestration scope

**Verified.** Earlier architecture recommended piloting mature orchestration
tools while keeping custom implementation to Kendall-specific policy and
adapters. The custom manager and workspace systems have since become major
subsystems.

**Decision needed.** Re-run build-versus-buy against actual MVP requirements:
either a supervisor-owned lifecycle with thin workspace/tmux adapters, or a
mature orchestration engine behind Kendall policy ports.

**Guardrail.** First extract behavioral contracts and ports. Do not replace one
large custom orchestration system with another without a narrow pilot.

### P2 — reduce test, script, and CI duplication

**Verified.** Large scenario suites, many envelope tests, source-text parity
checks, and 288 root scripts create a high cognitive and maintenance load.
The aggregate check is a long serial chain. CI performs its full workflow on
`main`, not on pushes to the active `dev` delivery branch.

The repository-wide `docs/workflows/ci-confidence-and-efficiency-policy.md`
governs this work beyond the cleanup program: it requires precise affected
bundle selection, no duplicate required invocation, behavior-based long-suite
shards, same-head migration evidence, and integration-branch/scheduled full
confidence.

**Plan.**

1. Establish four discoverable profiles: `fast`, `affected`, `full`, and
   `doctor`, with targeted component commands beneath them.
2. Make `dev` push, manual dispatch, and a scheduled health run execute the
   appropriate full/health profile.
3. Add lint and package-local typecheck gates. Add Python lint first, then
   targeted type checking once boundaries stabilize.
4. Generate shared types/clients from a contract source rather than regex
   checking duplicated language definitions.
5. Parameterize route/envelope tests from the registry; split mega-suites by
   bounded context while retaining fixture factories.
6. Use timing reports to remove repeated CI execution without reducing coverage.

**Exit proof.** A new contributor can discover the right command from one
document; profile coverage is explicit; CI provides post-merge `dev` evidence;
and no removed command is a hidden dependency of hooks or workflows.

### P2 — retire or quarantine old product surfaces

| Candidate | Recommended disposition | Required decision/proof |
| --- | --- | --- |
| `runtime/` | Archive/tag then remove if the Release 1 personal-assistant product is not on the roadmap. | Product owner confirms Outlook/scheduling/tasks is abandoned; no setup/packaging/runtime consumer remains. |
| V0 action and approval APIs | Migrate then delete. | Consumer, database, and approval-evidence migration is complete. |
| `/pipeline/demo` fixture catalogue | Retain as the supported, fixture-only daily-alpha flow; consider removal only after an authoritative product decision supersedes the runbook and fixture-fallback audit. | Decision record naming the superseded authority, caller/fixture reachability, and removal/rollback proof. |
| Epic/story-specific reports and panels | Move durable signal to a named capability or remove. | Report classification and replacement evidence. |
| Date-stamped gap reviews, closeouts, handoffs | Archive from current navigation. | Durable decision is represented in the current ADR/index. |

### P2 — shrink generated and configuration surface safely

The tracked `.agents/skills` tree is a temporary compatibility package, not
ordinary source. Pin its generator/version, add clean-clone regeneration plus
checksum verification, update every consumer, and only then untrack it. Do not
deduplicate individual files: relative layout may be part of the generated
contract.

Also establish portable local/LAN/container configuration profiles, a validated
`.env.example`, and a clear distinction between reusable defaults and
machine-specific addresses or credentials. Reduce `AGENTS.md` to durable
invariants; move command signatures and operational recipes into generated or
focused runbook material.

## Delivery phases

| Phase | Outcome | Work allowed | Exit gate |
| --- | --- | --- | --- |
| 0. Inventory and freeze | A reviewed, measurable cleanup backlog. | Add inventory, owners, dependencies, consumer searches, baseline timings/counts, rollback notes. | Each item is `keep`, `migrate`, `delete`, `archive`, or `decision-needed`; no new legacy surface. |
| 1. Safety and delivery | Authority and CI are internally consistent. | Correct authority record, add `dev`/manual/scheduled verification, lint/type checks, migration baseline. | Exact-target authority tests and supported-database upgrade proof pass. |
| 2. Lifecycle convergence | One authoritative lifecycle path. | Introduce target contract and read model; migrate dashboard and manager adapters. | Dashboard and manager consume the canonical path without fallback. |
| 3. Controlled retirement | Compatibility code and expired product surfaces shrink. | Remove V0, legacy routes, duplicated reports, and abandoned runtime material after proof; retire demo material only after authoritative supersession. | Consumer search, migration tests, and rollback reference are clean. |
| 4. Bounded-context refactor | Major modules have understandable ownership. | Split service/API/manager/workspace/fixtures by domain and ports. | No behavior change beyond a tested bounded slice; dependency direction is enforced. |
| 5. Verification and documentation consolidation | Lower cognitive load remains durable. | Replace script aliases, deduplicate CI, archive docs, migrate generated skills. | Clean clone, contributor path, profile matrix, and doc index all pass. |

Each phase may be delivered through multiple small PRs. A phase is not a reason
to batch unrelated changes or skip the preceding exit gate.

## Measures and review cadence

Record a baseline at Phase 0 and review it at the end of each phase:

- canonical versus legacy route and contract consumer count;
- largest-module line/method count and cross-boundary dependency count;
- number and duration of CI jobs/profiles;
- root command count and command discoverability;
- migration upgrade/rollback coverage for each supported database;
- runtime report/panel count by retained/developer/historical classification;
- generated/ignored/tracked artifact size and clean-clone reproducibility;
- active versus historical documentation index entries;
- worktree/lease metadata age, owner, and closure status.

Metrics are signals, not quotas: removing lines or tests without preserving the
contract is not progress.

## Additional cleanup lenses

The program must also examine the following, because code simplification alone
will not make the project easier or safer to operate:

- **Product value:** identify panels, routes, reports, and workflows with real
  operator value; remove duplicate status surfaces.
- **Security and privacy:** model trust boundaries; scan secrets and
  dependencies; review retention/deletion; maintain an SBOM and license view.
- **Data resilience:** exercise backup/restore, corruption, cancellation,
  idempotency, restart, and partial-failure recovery.
- **Operational simplicity:** minimize processes, ports, environment modes, and
  startup steps; provide one-command diagnosis.
- **Performance and cost:** profile dashboard bundle size, API/query behavior,
  CI minutes, and any provider-call budget.
- **Accessibility and UX:** test keyboard, screen-reader, responsive behavior,
  and operator information density.
- **Ownership and supply chain:** define maintained boundaries, dependency
  update policy, source provenance, and generated-file ownership.
- **Repository operations:** reconcile stale local branches, worktrees, leases,
  and historical workflow metadata through their governing tools rather than
  manual record edits.

## Immediate next slice

Start Phase 0 with a **lifecycle and retirement inventory**, not a refactor:

1. enumerate every caller of legacy `/work-packets`, `WorkPacketV0`, and V0
   action/approval models;
2. record the authoritative target lifecycle contract and the manager fields
   that are truly transient;
3. classify every supervisor report route and dashboard panel;
4. record caller reachability, archive destination, and rollback evidence for
   the resolved `runtime/` retirement and the authoritative `/pipeline/demo`
   retention decision; reconsider the demo only after documented supersession;
5. baseline current CI durations, database state, script dependencies, and
   documentation navigation; and
6. publish the first narrow migration PR only after that evidence and its
   rollback path are reviewed.

This ordering attacks the project’s real complexity—competing truths and
unbounded surfaces—before spending time on cosmetic code movement.
