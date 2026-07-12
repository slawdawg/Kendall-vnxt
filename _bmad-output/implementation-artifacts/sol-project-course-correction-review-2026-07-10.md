# Kendall_Nxt Whole-Project Course-Correction Review — Second Pass

Date: 2026-07-10
Mode: read-only whole-project architecture/product review; this existing ignored artifact is the only updated file
Retention: metadata only
Repository: `/home/slaw_dawg/Kendall_Nxt`
Reviewed worktree: `agent/operational-pipeline-action-loop` at `b59ed9f0`
Latest locally available delivered ref reviewed: `origin/dev` at `386a8402`

## Evidence classes and limits

This review deliberately separates three evidence classes:

- **[SOURCE]** means Git-backed source, tests, policy, architecture, or local Git
  objects. Source code proves that a behavior is implemented; an unexecuted test
  proves only that an assertion exists. Dirty source is labeled **[PROVISIONAL]**.
- **[BMAD]** means ignored local PRDs, architecture, epics, stories, sprint
  status, or review packets under `_bmad-output`. These establish planning intent
  or a local claim, not delivery or runtime truth, unless source-owned evidence
  independently corroborates them.
- **[INFERENCE]** means the reviewer's conclusion from the cited evidence. It is
  not itself a source-of-truth decision.

This distinction is required by repository policy: generated BMAD work products
remain local planning state and durable decisions must be rewritten into
source-owned material at
`/home/slaw_dawg/Kendall_Nxt/AGENTS.md:191-197`. The stronger source-owned product
boundary says local BMAD PRDs and stories are not active clean-install
verification sources at
`/home/slaw_dawg/Kendall_Nxt/docs/workflows/product-requirements-boundary.md:1-5`.
At the same time, the source-owned manager goal resolves the current local PRD
bundle at
`/home/slaw_dawg/Kendall_Nxt/docs/workflows/latest-prd-autonomous-bmad-loop-goal.md:17-29`
and `:40-48`. **[INFERENCE]** The current PRD is authoritative for this local
planning run only because a source-owned operating contract points to it; its
durable product requirements are not authoritative for a clean install until
promoted into source-owned requirements, tests, or policy. This unresolved
authority split is itself a correction item.

No provider, GitHub, worker, workspace, tmux, secret, production, or network
operation was performed. No tests were rerun in this second pass because the
request permits no writes beyond this artifact and multiple suites create local
fixture/cache state. Prior test results recorded by the first pass are historical
review evidence only. No raw prompt, completion, provider payload, reasoning
trace, secret, terminal/tmux scrollback, or unnecessary source copy is retained.

## Executive decision

**Decision: course-correct now; hold production posture; do not create Epic 26.**

Kendall_Nxt has a substantial, useful pre-alpha control-plane foundation, but it
is not production-ready and the current Operational Pipeline Action Loop MVP is
not yet proven end to end.

What is genuinely delivered:

- **[SOURCE]** A local-first dashboard, FastAPI supervisor, shared contracts,
  workflow support, and manager tooling exist. The durable architecture defines
  the dashboard as operator surface, the supervisor as system of record/runtime,
  and BMAD/KNX as governance at
  `/home/slaw_dawg/Kendall_Nxt/docs/architecture/kendall-vnxt-overall-architecture.md:46-81`.
- **[SOURCE]** The supervisor has a versioned operational-action API, durable
  action records, idempotency, optimistic current-event checks, Ready To Test
  pass/fail/rework behavior, child lineage, projection capabilities, and typed
  blocked results. Representative implementation is at
  `/home/slaw_dawg/Kendall_Nxt/services/supervisor/src/supervisor/application/service.py:365-376`
  and `:791-971`; persistence constraints are at
  `/home/slaw_dawg/Kendall_Nxt/services/supervisor/src/supervisor/infrastructure/db/models.py:111-163`.
- **[SOURCE]** `/pipeline` submits only backend-projected `mark_tested` and
  `request_rework` controls and reloads backend truth at
  `/home/slaw_dawg/Kendall_Nxt/apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx:211-245`.
- **[SOURCE]** Runtime-port and fake/local-proof machinery exists, and it
  correctly refuses a live-worker claim in the proof harness at
  `/home/slaw_dawg/Kendall_Nxt/scripts/lib/manager-control-plane/backend-proof-harness.mjs:9-35`.

What is not proven:

- **[SOURCE]** The source-owned smoke creates a packet directly in `review`,
  with Ready To Test metadata already attached, then submits `mark_tested`; it
  does not traverse source evaluation, queueing, lease acquisition, worker or
  runtime execution, verification, review, and recovery as one integrated path
  (`/home/slaw_dawg/Kendall_Nxt/services/supervisor/scripts/pipeline_operational_smoke.py:29-98`).
  It nevertheless emits `truthLabel: live_backend_local_proof` at `:120-138`.
  **[INFERENCE]** This is a valid action/API smoke, not the PRD's complete
  minimum operational-loop proof.
- **[SOURCE]** The manager backend-proof harness is explicitly simulated,
  performs metadata-only verification/session/policy checks, and reports
  `metadata_proof_only` at
  `/home/slaw_dawg/Kendall_Nxt/scripts/lib/manager-control-plane/backend-proof-harness.mjs:89-100`,
  `:172-229`, and `:277-315`. It is not connected to the supervisor smoke as one
  authoritative lifecycle.
- **[SOURCE]** Real provider calls, direct worker launch, adaptive routing,
  background assistant behavior, broader mutation, and production/account
  integrations remain intentionally deferred at
  `/home/slaw_dawg/Kendall_Nxt/docs/architecture/kendall-vnxt-overall-architecture.md:285-295`.
- **[SOURCE]** The project calls itself pre-alpha and requires narrow dogfoodable
  slices, not production completeness, at
  `/home/slaw_dawg/Kendall_Nxt/AGENTS.md:271-285`.

**[INFERENCE]** The correct product claim is therefore: “pre-alpha, contract-rich,
locally dogfoodable action/projection control plane with simulated runtime proof.”
It is not yet “an end-to-end operational assistant runtime” and is not a
production-ready multi-worker system.

## Authoritative project goals

### Durable product goal

**[SOURCE]** The broad accepted architecture defines Kendall as a local-first
assistant operating system—not a chatbot—composed of governance workflows, a
supervisor runtime, an operator dashboard, shared contracts, and progressively
authorized worker lanes
(`/home/slaw_dawg/Kendall_Nxt/docs/architecture/kendall-vnxt-overall-architecture.md:7-12`).
The README uses the narrower description “local-first development control plane
for coordinating Codex/BMAD work”
(`/home/slaw_dawg/Kendall_Nxt/README.md:1-9`).

**[INFERENCE]** The durable goal common to both is:

> Give one local operator a trustworthy, recoverable control plane that turns
> source-backed development intent into auditable work lifecycle state, exposes
> safe next actions in `/pipeline`, and expands execution authority only through
> explicit, evidence-backed gates.

This formulation intentionally excludes hosted multi-tenancy, invisible
background autonomy, worker-count theater, and provider-specific product truth.

### Current child-slice goal

**[BMAD]** The local PRD says `/pipeline` must become operational rather than
merely informative and that one source-backed packet should be evaluated,
queued/blocked, leased/simulated, evidenced, reviewed/tested, projected, and
advanced/held without reading logs, tmux, or BMAD artifacts
(`/home/slaw_dawg/Kendall_Nxt/_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-operational-pipeline-action-loop/prd.md:28-63`).
Its operator journeys require a minimum loop, blocked-path handling, mature-tool
evaluation, Ready To Test feedback, and safe pause/drain/degrade behavior at
the same file `:96-154`.

The MVP is intentionally bounded to local proof, one live packet plus simulated
or fake-worker confidence coverage, and no unattended long-running run or deep
provider optimization (`:597-624`). Its primary success tests are a
single-command loop, source-backed `/pipeline` truth, tool decisions,
idempotency, and replay/hold (`:644-680`).

### Architecture invariants

The following should remain non-negotiable:

1. **[SOURCE] Supervisor owns lifecycle truth.** Dashboard and manager summaries
   may project or explain it but must not create a competing lifecycle
   (`/home/slaw_dawg/Kendall_Nxt/docs/architecture/kendall-vnxt-overall-architecture.md:100-137`).
2. **[SOURCE] Capability is not permission.** No credentials, external sends,
   source mutation, destructive action, or production/account access without an
   explicit boundary; every worker action leaves reviewable evidence (`:232-243`).
3. **[BMAD] Mature tools are replaceable substrates behind Kendall ports, never
   product-truth owners**
   (`/home/slaw_dawg/Kendall_Nxt/_bmad-output/planning-artifacts/architecture-operational-pipeline-action-loop-2026-07-04.md:92-101`).
4. **[SOURCE] Generated BMAD state is planning evidence, not delivered product**
   (`/home/slaw_dawg/Kendall_Nxt/docs/workflows/implementation-evidence-boundary.md:1-7`).
5. **[SOURCE] No post-slice work exists merely to keep workers busy**
   (`/home/slaw_dawg/Kendall_Nxt/docs/workflows/latest-prd-autonomous-bmad-loop-goal.md:111-117`).

## Goal-to-delivery traceability

| Goal / required outcome | Source of intent | Delivered evidence | Assessment |
| --- | --- | --- | --- |
| Canonical backend-owned packet/action truth | **[BMAD]** PRD FR1, FR5-FR10; epics map at `/home/slaw_dawg/Kendall_Nxt/_bmad-output/planning-artifacts/epics.md:332-367` | **[SOURCE]** contracts at `/home/slaw_dawg/Kendall_Nxt/packages/contracts/src/pipeline-control-plane/index.ts:300-419`; supervisor actions at `/home/slaw_dawg/Kendall_Nxt/services/supervisor/src/supervisor/application/service.py:791-971` | **Delivered for bounded actions.** Idempotency and current-event checks are real; broader action set is mostly gated. |
| Runtime ports and replaceable substrates | **[BMAD]** PRD FR2-FR4, FR21-FR24 | **[SOURCE]** local-proof adapters and proof harness; harness blocks live claims at `/home/slaw_dawg/Kendall_Nxt/scripts/lib/manager-control-plane/backend-proof-harness.mjs:22-35` | **Contract/local-proof delivered; live adapter adoption not delivered.** |
| One source-backed minimum operational loop | **[BMAD]** PRD FR11-FR14 and UJ-1 | **[SOURCE]** supervisor smoke starts at review (`/home/slaw_dawg/Kendall_Nxt/services/supervisor/scripts/pipeline_operational_smoke.py:53-71`); manager harness is separate and simulated | **Not proven end to end.** Queue/lease/runtime/verification and dashboard action are not one lifecycle proof. |
| Blocked-path visibility and safe degradation | **[BMAD]** FR13, FR18, FR22, FR25 | **[SOURCE]** blocked action result in smoke at `/home/slaw_dawg/Kendall_Nxt/services/supervisor/scripts/pipeline_operational_smoke.py:100-118`; typed policies at `/home/slaw_dawg/Kendall_Nxt/services/supervisor/src/supervisor/application/service.py:365-384` | **Partially delivered.** Approval/resource/runtime blockers are modeled; integrated failure and restart proof remains separate/simulated. |
| Ready To Test pass/fail/rework with lineage | **[BMAD]** FR19, FR27 | **[SOURCE]** backend mutation and child creation at `/home/slaw_dawg/Kendall_Nxt/services/supervisor/src/supervisor/application/service.py:857-916` and `:1007-1057`; dashboard controls at `/home/slaw_dawg/Kendall_Nxt/apps/dashboard/src/lib/pipeline/active-board-view-model.ts:502-587` | **Delivered for the bounded slice.** Approval binding is too weak for stronger authority claims. |
| Compact actionable `/pipeline` | **[BMAD]** FR15-FR16, FR20, FR32-FR34 | **[SOURCE]** only mark-tested/rework are submitted at `/home/slaw_dawg/Kendall_Nxt/apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx:211-245`; the closeout explicitly leaves retry, reassignment, worker/source mutation, delivery, merge, cleanup, and unattended execution gated at `/home/slaw_dawg/Kendall_Nxt/docs/workflows/operational-pipeline-action-loop-closeout.md:26-33` | **Useful but narrower than the user-journey wording.** Correctly gated; not a general operations console. |
| Durable source/evidence boundary | **[SOURCE]** architecture and AGENTS policy | **[SOURCE]** metadata-only contracts and forbidden metadata checks at `/home/slaw_dawg/Kendall_Nxt/packages/contracts/src/pipeline-control-plane/index.ts:421-439` | **Strong foundation.** Product/source authority remains internally contradictory. |
| Production hardening and scale validation | **[BMAD]** appended Epic 25 at `/home/slaw_dawg/Kendall_Nxt/_bmad-output/planning-artifacts/epics.md:716-725` | **[SOURCE]** six local `origin/dev` commits alter contracts, manager evidence builders, and tests only | **Contracts/evidence scaffolding only; no live canary/ramp/recovery proof.** |
| Production readiness | No approved durable production PRD; broad architecture defers production integrations | **[SOURCE]** Epic 25 decision builder always leaves rollout/provider/secret/merge/cleanup false in the local `origin/dev` object for `/home/slaw_dawg/Kendall_Nxt/scripts/lib/manager-control-plane/operational-readiness.mjs:987-1024` | **Hold. Production target, topology, identity, auth, SLO source, and operational ownership are undefined or unproven.** |

## Delivered versus claimed epic status

### Epics 1-4

The ignored epic coverage map assigns all FR1-FR34 to Epics 1-4
(`/home/slaw_dawg/Kendall_Nxt/_bmad-output/planning-artifacts/epics.md:332-395`).

- **Epic 1 — substantially delivered.** Action contracts, records, idempotency,
  correlation, optimistic stale-state rejection, risk/authority labels, and
  replayable results exist. “Replay/recovery” is stronger at contract/test level
  than as an integrated restart proof.
- **Epic 2 — contract-complete/local-proof only.** Runtime ports and adapter
  contract tests exist; selected live substrate adoption does not.
- **Epic 3 — partially delivered, not acceptance-proven.** Source-backed packet
  persistence, fake queue/lease proof, evidence boundaries, and a smoke command
  exist, but the smoke bypasses most of the minimum loop and the fake harness is
  not the supervisor lifecycle.
- **Epic 4 — substantially delivered for Ready To Test.** Contextual controls and
  backend actions exist. The broader operator override list is intentionally
  gated rather than operational.

**[INFERENCE]** The previous “MVP substantially complete; final smoke pending”
posture was too generous. The revised posture is **foundation substantially
implemented; Epic 3 integrated acceptance proof still missing**.

### Generated Epics 5-24

**[BMAD]** Sprint status contains generic continuation epics, stale active rows,
and a gap where Epics 8-19 have story artifacts but no tracker rows. The tracker
scope and rows are at
`/home/slaw_dawg/Kendall_Nxt/_bmad-output/implementation-artifacts/sprint-status.yaml:32-46`
and `:75-145`.

**[SOURCE]** Local merge history contains substantial manager/tooling delivery,
but Git delivery does not convert generic continuation epics into product
requirements. **[INFERENCE]** Preserve them as implementation/operational
history, reconcile stale statuses before any future dispatch, and do not rebuild
missing numbering merely for continuity.

### Epic 25: production proof or scaffolding?

**Decision: Epic 25 proves contracts/evidence scaffolding, not production
readiness and not live scale.**

Evidence:

1. **[BMAD] Scope contradiction.** Epic 25 says it adds one-worker live canary,
   a 1→2→4→6 live ramp, recovery drills, and a production decision while claiming
   not to change PRD intent
   (`/home/slaw_dawg/Kendall_Nxt/_bmad-output/planning-artifacts/epics.md:716-725`,
   `:762-848`, and `:877-909`). The PRD explicitly excludes more than one live
   packet and unattended long-running execution from MVP
   (`/home/slaw_dawg/Kendall_Nxt/_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-operational-pipeline-action-loop/prd.md:615-624`).
2. **[SOURCE] Delivery shape.** Commits `ba6d5a21`, `a4c4e6b1`, `e3883779`,
   `589c62b0`, `a93e9a90`, and `c18137ef` modify only four recurring surfaces:
   `packages/contracts/src/pipeline-control-plane/index.ts`,
   `scripts/lib/manager-control-plane/core.mjs`,
   `scripts/lib/manager-control-plane/operational-readiness.mjs`, and
   `tests/operational-readiness-contract.test.mjs`. They add no live controller,
   supervisor endpoint, provider/substrate adapter, telemetry store, alert
   integration, deployment path, or dashboard operation.
3. **[SOURCE] Dry-run projection.** The locally delivered tests assert that the
   continuous runtime projects canary/ramp/recovery evidence while holding or
   blocking rollout and external calls at local `origin/dev` object
   `/home/slaw_dawg/Kendall_Nxt/tests/operational-readiness-contract.test.mjs:195-210`,
   `:298-306`, `:378-385`, and `:460-474`.
4. **[SOURCE] Fixture can claim “go.”** The same test suite constructs all
   predecessor inputs in memory, sets `fixtureEvidence: true`, and expects a
   production decision of `go` at local `origin/dev` object
   `/home/slaw_dawg/Kendall_Nxt/tests/operational-readiness-contract.test.mjs:489-511`.
   The decision builder records but does not disqualify fixture evidence at local
   `origin/dev` object
   `/home/slaw_dawg/Kendall_Nxt/scripts/lib/manager-control-plane/operational-readiness.mjs:1017-1023`.
   **[INFERENCE]** This directly violates the PRD counter-metric forbidding
   fixture/simulated proof from being presented as live operation
   (`/home/slaw_dawg/Kendall_Nxt/_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-operational-pipeline-action-loop/prd.md:671-680`).
5. **[SOURCE] Even “go” grants no operation.** The builder forces rollout,
   automatic deployment, provider calls, secret access, merge, and cleanup to
   false at local `origin/dev` object
   `/home/slaw_dawg/Kendall_Nxt/scripts/lib/manager-control-plane/operational-readiness.mjs:987-1016`.

**[INFERENCE]** Reclassify Epic 25 as “post-MVP readiness contract scaffolding,
operation held.” The contracts are useful if tightened, but story titles and
`done` status must never be cited as live execution evidence.

### Should Epic 26 exist?

**No—not under the current source bundle and not as a generic continuation.**

All PRD FRs are already assigned to Epics 1-4. The source-owned operating goal
forbids post-slice work merely to keep workers busy
(`/home/slaw_dawg/Kendall_Nxt/docs/workflows/latest-prd-autonomous-bmad-loop-goal.md:111-117`).
The current refill selector does the opposite: zero backlog selects
`bmad-correct-course` for backlog expansion
(`/home/slaw_dawg/Kendall_Nxt/scripts/lib/manager-control-plane/core.mjs:14549-14599`),
and tests intentionally advance generated epic numbers after completed generated
epics (`/home/slaw_dawg/Kendall_Nxt/tests/manager-control-plane.test.mjs:1151-1247`).

Epic 26 may exist only after an operator-approved, source-resolved next product
outcome exists. A separate post-MVP PRD should normally restart coherent epic
numbering inside that source bundle rather than inherit “26” as if one endless
backlog were a product roadmap. Worker utilization, tracker continuity, or an
empty queue are not product requirements.

## What is wrong and needs correction

1. **Proof semantics are ahead of behavior.** The project uses “live,” “done,”
   and “production readiness” for schemas and fixture-fed builders. Honest labels
   must distinguish contract-valid, simulated, integrated-local, bounded-live,
   and production-operated evidence.
2. **The product has two operational centers.** The architecture says the Python
   supervisor owns runtime truth, but the 27,207-line delivered Node manager core also owns
   queue/runtime/refill/readiness projections. The two are connected by evidence
   and summaries, not one atomic lifecycle. This makes end-to-end claims hard to
   establish and creates duplicated policy.
3. **Approval is a client-supplied string, not bound authority.** The backend
   treats any evidence ref beginning with `evidence:product-test-approval` or
   `evidence:authority-approval` as approval
   (`/home/slaw_dawg/Kendall_Nxt/services/supervisor/src/supervisor/application/service.py:820-851`).
   The dashboard itself always supplies `evidence:product-test-approval`
   (`/home/slaw_dawg/Kendall_Nxt/apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx:221-236`).
   The TypeScript validator prevents `requestedAuthorityState: allowed` but does
   not make an arbitrary approval ref authoritative
   (`/home/slaw_dawg/Kendall_Nxt/packages/contracts/src/pipeline-control-plane/index.ts:555-570`).
   **[INFERENCE]** This is adequate only as a local operator-intent gesture, not
   as an approval security boundary.
4. **No-auth network exposure conflicts with mutating controls.** The default dev
   services bind to `0.0.0.0`, the supervisor URL is browser-visible, and auth is
   explicitly outside base install
   (`/home/slaw_dawg/Kendall_Nxt/README.md:82-113`). Production readiness is
   impossible until the supported trust boundary is explicit: loopback-only,
   authenticated reverse proxy, or first-class auth/CSRF/session controls.
5. **Source authority is contradictory.** One source-owned file says local PRDs
   are not active verification truth; another resolves one as authoritative for
   autonomous completion. Future sessions can follow either rule and both appear
   legitimate.
6. **Completion feeds backlog generation.** The refill selector treats zero
   backlog as a planning gap rather than a possible terminal state. That creates
   scope without a product outcome and explains Epic-number churn.
7. **Architecture and product naming are stale.** The accepted June 8
   architecture describes broad assistant-OS ambitions, while the current README
   describes a development control plane. The source-owned architecture index is
   dated June 8 and still calls all real execution authority disabled
   (`/home/slaw_dawg/Kendall_Nxt/docs/architecture/index.md:1-11` and `:36-46`),
   while later source boundaries record selected bounded execution. Future work
   lacks one current architecture/status spine.
8. **Verification breadth hides acceptance gaps.** The root `check` script is a
   very large chain of contract-drift checks and test suites
   (`/home/slaw_dawg/Kendall_Nxt/package.json:174-174` and `:220-223`). Strong
   contract coverage is valuable, but many checks verify that documents, schemas,
   fixtures, and UI labels agree—not that the user's end-to-end job succeeds.
9. **Current worktree is not a delivery baseline.** HEAD is two commits ahead and
   ten commits behind local `origin/dev`, and the dirty four-file diff contains
   117 additions and 2,327 deletions. It removes large manager-core/test regions.
   **[PROVISIONAL]** It must be preserved and owned, not used as readiness proof.

## Technical-debt and risk register

| ID | Severity | Debt / risk | Evidence and impact | Required correction |
| --- | --- | --- | --- | --- |
| TD-01 | **Critical** | Client-asserted approval evidence | `/home/slaw_dawg/Kendall_Nxt/services/supervisor/src/supervisor/application/service.py:820-851`; dashboard injects the accepted prefix at `/home/slaw_dawg/Kendall_Nxt/apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx:221-236` | Bind actions to a server-issued approval record containing exact actor, action, target, event/version, risk, expiry, and one-time/idempotent consumption. |
| TD-02 | **Critical** | Minimum-loop smoke bypasses the loop | `/home/slaw_dawg/Kendall_Nxt/services/supervisor/scripts/pipeline_operational_smoke.py:53-98` seeds at review; `:120-138` labels it live | Replace or rename it to action-loop smoke; add an integrated source→queue→lease→fake worker→verification→review→operator-action proof. |
| TD-03 | **Critical** | Fixture-built Epic 25 inputs can produce `go` | Local `origin/dev` `/home/slaw_dawg/Kendall_Nxt/tests/operational-readiness-contract.test.mjs:498-511`; decision only records fixture signal at local `origin/dev` `/home/slaw_dawg/Kendall_Nxt/scripts/lib/manager-control-plane/operational-readiness.mjs:1017-1023` | Make fixture/simulated/unverifiable provenance a hard blocker for live or production decisions; require verifiable receipts from an evidence source, not caller booleans. |
| TD-04 | **High** | Runaway backlog/Epic generation | `/home/slaw_dawg/Kendall_Nxt/scripts/lib/manager-control-plane/core.mjs:14593-14599`; `/home/slaw_dawg/Kendall_Nxt/tests/manager-control-plane.test.mjs:1151-1247` | Introduce `authoritative_backlog_exhausted` terminal disposition; correct-course requires a named unmet requirement or approved correction. |
| TD-05 | **High** | Split supervisor/manager lifecycle and policy | Supervisor truth contract at `/home/slaw_dawg/Kendall_Nxt/docs/architecture/kendall-vnxt-overall-architecture.md:100-137`; separate manager proof at `/home/slaw_dawg/Kendall_Nxt/scripts/lib/manager-control-plane/backend-proof-harness.mjs:89-132` | Choose one state machine/system of record and make the other a port adapter/client. |
| TD-06 | **High** | No-auth mutating API on non-loopback default | `/home/slaw_dawg/Kendall_Nxt/README.md:82-113` | Define supported threat model; default mutating service to loopback or add authenticated session, CSRF/origin protection, actor identity, and audit binding before any production claim. |
| TD-07 | **High** | Product/source authority conflict | `/home/slaw_dawg/Kendall_Nxt/docs/workflows/product-requirements-boundary.md:1-5` versus `/home/slaw_dawg/Kendall_Nxt/docs/workflows/latest-prd-autonomous-bmad-loop-goal.md:21-50` | Create one source-owned product charter/current-slice manifest; local BMAD may elaborate but not supersede it. |
| TD-08 | **High** | Extreme monolith concentration | At local `origin/dev`, `/home/slaw_dawg/Kendall_Nxt/scripts/lib/manager-control-plane/core.mjs:1` is 27,207 lines and `/home/slaw_dawg/Kendall_Nxt/tests/manager-control-plane.test.mjs:1` is 30,589 lines; `/home/slaw_dawg/Kendall_Nxt/services/supervisor/src/supervisor/application/service.py:1` is 27,780 lines in the reviewed tree | Extract domain modules by lifecycle/authority/refill/readiness; enforce dependency direction and focused test ownership. Do this incrementally after behavioral gates, not as a rewrite. |
| TD-09 | **High** | Readiness vocabulary overstates evidence | PRD forbids fixture-as-live at `/home/slaw_dawg/Kendall_Nxt/_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-operational-pipeline-action-loop/prd.md:671-680`; Epic 25 tests synthesize “live” | Adopt an evidence-level enum and prohibit promotion without provenance transition receipts. |
| TD-10 | **Medium** | SQLite local proof vs undefined production topology | Default SQLite/PostgreSQL option at `/home/slaw_dawg/Kendall_Nxt/README.md:91-97`; smoke forces disposable SQLite at `/home/slaw_dawg/Kendall_Nxt/services/supervisor/scripts/pipeline_operational_smoke.py:29-34` | Define supported deployment/database topology and run concurrency/restart/migration proof on that topology before scale claims. |
| TD-11 | **Medium** | Contract/check sprawl obscures product acceptance | `/home/slaw_dawg/Kendall_Nxt/README.md:115-184`; `/home/slaw_dawg/Kendall_Nxt/package.json:174-174` | Separate fast contract checks, integration acceptance, browser acceptance, and operational certification; publish a small evidence matrix. |
| TD-12 | **Medium** | Dirty/diverged primary worktree | Local Git metadata: HEAD `b59ed9f0`, local `origin/dev` `386a8402`, dirty four-file large deletion | Establish provenance and an owning lane; do not rebase/apply/discard/merge until deleted safety behavior is compared and focused tests pass from a clean baseline. |
| TD-13 | **Medium** | Architecture/status spine is outdated | `/home/slaw_dawg/Kendall_Nxt/docs/architecture/index.md:1-11`; broad state at `/home/slaw_dawg/Kendall_Nxt/docs/architecture/kendall-vnxt-overall-architecture.md:245-313` | Publish one source-owned current architecture/status view that distinguishes implemented, simulated, approved-live, and deferred capabilities. |

## Design alternatives and tradeoffs

### Alternative A — Supervisor-centered canonical runtime (recommended)

Make the FastAPI supervisor/database the only WorkPacket/action/attempt state
machine. Treat the Node manager as an execution adapter that claims work through
versioned supervisor ports and reports signed/bound receipts back. `/pipeline`
continues to read the supervisor projection.

- Benefits: matches accepted architecture; one transaction and replay model;
  easiest end-to-end acceptance proof; less duplicated policy.
- Costs: manager scripts must be gradually adapted; existing Node lifecycle logic
  needs classification as reusable adapter logic, projection-only logic, or debt.
- Best use: current pre-alpha correction because it preserves delivered APIs and
  avoids a rewrite.

### Alternative B — Manager-centered runtime, supervisor as API/read model

Promote the Node manager ledger/dispatcher to canonical truth and make FastAPI a
projection facade.

- Benefits: aligns product truth with the machinery that currently controls
  workers/worktrees/refill.
- Costs: contradicts the accepted architecture, duplicates or migrates database
  behavior, risks breaking dashboard/contracts, and keeps the largest monolith at
  the center.
- Decision: not recommended unless a new architecture demonstrates a migration
  advantage that outweighs the rewrite and recovery risk.

### Alternative C — Explicit event bridge between two bounded control planes

Keep supervisor product lifecycle and manager execution lifecycle separate, but
define durable command/event/receipt contracts with correlation, idempotency,
ownership, and reconciliation.

- Benefits: least immediate migration; respects different domain concerns.
- Costs: distributed-state reconciliation, more failure modes, and harder replay;
  “which system is right?” remains a routine operational question.
- Decision: acceptable interim path only if every cross-boundary state has a
  canonical owner and reconciliation test.

### Alternative D — Adopt a mature workflow engine now

Put Hatchet, Temporal, Prefect, BullMQ, or similar behind Kendall ports.

- Benefits: mature retry, timeout, scheduling, and visibility mechanics.
- Costs: does not solve product truth, approval binding, evidence provenance, or
  source-authority drift; adds deployment/operations before the minimum loop is
  honestly proven.
- Decision: defer. First prove the canonical loop with local/fake execution, then
  benchmark one engine against the port contract and recovery acceptance suite.

## Priority roadmap

### Now — P0 correctness and truth

1. **Freeze generated continuation.** No Epic 26, no stale Epic 5/7/22 dispatch,
   no production claim, and no use of the dirty primary worktree as baseline.
2. **Resolve the source hierarchy.** Create, in a separately authorized source
   change, a concise source-owned product charter/current-slice manifest that
   names product goal, current PRD status, production definition, authority
   boundary, and completion conditions. This review does not create it.
3. **Fix source exhaustion.** Zero authoritative backlog must terminate in audit,
   status reconciliation, retrospective, and housekeeping. `bmad-correct-course`
   must require a specific unmet requirement, contradiction, or explicit operator
   steering packet.
4. **Fix approval binding before expanding controls.** Replace magic evidence-ref
   prefixes with server-resolved approval records and exact action/target/event
   binding. Keep current mutation local-only until this gate passes.
5. **Build the missing integrated MVP proof.** Start with a real source ref at
   capture, pass through canonical eligibility/queue/lease, use a fake/local-proof
   worker through the selected port, attach verification/evidence, reach review,
   render on `/pipeline`, and exercise pass plus blocked/rework paths. One
   supervisor-owned lifecycle and one correlation id must explain the entire run.
6. **Correct evidence vocabulary.** Rename the existing smoke if retained; add
   `contract`, `fixture`, `simulated`, `integrated_local`, `bounded_live`, and
   `production_observed` evidence levels. Prevent caller-declared escalation.

### Next — P1 operability and maintainability

7. **Choose the canonical runtime boundary** using Alternative A unless new
   evidence justifies otherwise; document manager-to-supervisor command/receipt
   ports and reconciliation behavior.
8. **Tighten Epic 25 builders.** Fixture evidence, caller booleans, unresolvable
   refs, stale evidence, and missing independent receipts must block live/go.
   Rename outputs to readiness *decision records*, not operational proof.
9. **Define the supported trust/deployment boundary.** For local personal use,
   prefer loopback-only mutation by default. If LAN/Tailscale operation is a
   requirement, add authenticated identity/session and request-forgery controls.
10. **Establish a clean delivered baseline and verification matrix.** Separate
    contract, integration, browser, concurrency/restart, and operational evidence;
    record exact ref/topology for every result.
11. **Decompose monoliths along proven boundaries.** Extract approval, action,
    projection, refill, runtime-readiness, and evidence-provenance modules with
    characterization tests. Avoid a broad rewrite.

### Later — P2 post-MVP capability

12. Evaluate one mature runtime against the stable port/recovery suite.
13. Run one explicitly authorized bounded-live canary only after source, identity,
    telemetry, rollback, budget, provider/substrate, and evidence-receipt gates
    exist. A contract-generated canary packet is not the canary.
14. Add staged capacity testing only if the product goal actually needs parallel
    workers. Define workload, topology, duration, SLOs, data source, and abort
    controller first.
15. Create a separate post-MVP production-readiness PRD only after “production”
    has a concrete user, host/topology, availability target, security boundary,
    support owner, backup/recovery target, and release process.

## Missing tools and process gaps

| Gap | Why it matters | Minimum addition |
| --- | --- | --- |
| Source-owned current-slice manifest | Future sessions cannot reliably resolve local PRD versus durable requirements | One versioned source file naming active product outcome, local planning bundle, supersession, completion, and stop state |
| Evidence provenance verifier | Current builders trust booleans and string refs | Resolver that verifies evidence id, producer, exact target/run, truth level, timestamp, and immutable digest/receipt |
| Server-side approval ledger | Client-supplied strings can authorize medium-risk mutation | Exact action-target-event approval record with expiry, actor, consumption, idempotency, and audit event |
| Integrated acceptance harness | Contract tests and separate fake runtime do not prove the user journey | One disposable but real supervisor lifecycle with fake worker port and dashboard/API assertions from capture through test/rework |
| Production topology definition | “Production-ready” has no stable meaning | Source-owned deployment profile: host, bind/auth, DB, process supervision, backups, observability, SLOs, upgrade/rollback |
| Concurrency/restart certification | SQLite fixture tests do not prove multi-worker behavior | PostgreSQL-backed race, lease expiry, process restart, duplicate delivery, and replay tests on the supported topology |
| Test taxonomy/report | Large aggregate check conflates schema alignment with product proof | Small matrix with `contract`, `integration`, `browser`, `operational`, and `live` levels plus exact ref and last result |
| Architecture decision record for runtime ownership | Node manager and Python supervisor overlap | ADR choosing canonical state owner, command/event direction, reconciliation, and migration plan |
| Terminal completion state in manager | Empty backlog currently creates work | Machine-checkable `authoritative_backlog_exhausted` state with no candidate epic/story emission |

## Proposed course-correction sequence and acceptance gates

### Gate 0 — Preserve and establish provenance

- Current dirty diff has an identified owner and purpose.
- Clean delivered baseline is an exact local Git ref containing the intended
  operational loop and Epic 25 scaffolding.
- No unrelated diff, untracked planning mutation, or branch divergence is folded
  into correction work.

**Stop if:** ownership is ambiguous, the baseline is dirty, or deleted safety
tests/logic cannot be accounted for.

### Gate 1 — Source and product decision

- Source-owned charter states Kendall's current product goal and pre-alpha status.
- It explicitly classifies the local PRD/architecture/epics as delegated planning
  inputs, not clean-install truth.
- It defines whether the next target is “MVP integrated local proof” or a separate
  post-MVP bounded-live goal.
- “Production” and “live” have closed definitions.

**Stop if:** two sources remain equally authoritative or production/live terms
remain undefined.

### Gate 2 — Completion/refill correction

- Zero authoritative backlog yields `authoritative_backlog_exhausted`.
- No Epic 26/story candidate is emitted for the completed source bundle.
- Correct-course requires a named unmet FR, failed acceptance gate,
  source/architecture contradiction, or explicit operator steering record.
- Regression tests cover completed PRD, stale tracker rows, generated-history
  epics, and a genuinely incomplete PRD.

**Stop if:** worker demand, tracker numbering, or generic templates can still
create product work.

### Gate 3 — Authority binding

**Status:** completed.

**Completion record:** PR #513 merged at SHA
`825aac913732e0778fe982e152a2c2eba261bb9d`. The canonical server-owned local
operator is `pipeline-operator`; mutation is loopback-only. Non-loopback access
is read-only and requires `authenticated_session_required`; forwarded headers
are not trusted. Focused verification passed with `1 passed / 48 deselected`,
full verification passed with `273 passed / 1 skipped`, and CI is green.

- Backend resolves approval ids from its own store; prefixes/strings are not
  authority.
- Approval binds actor, action, target, expected event/version, risk, expiry, and
  allowed use count.
- Replay is idempotent; changed metadata or stale packet state fails closed.
- Unauthenticated/non-loopback mutation is impossible under the supported local
  profile.

**Stop if:** the browser can mint approval by choosing an evidence string, actor
identity is untrusted, or request forgery/network origin is unresolved.

### Gate 4 — Integrated MVP proof

- One source-backed packet starts at capture and reaches a terminal/held state
  through canonical supervisor lifecycle truth.
- Queue, lease, fake/local-proof worker, verification, evidence, review,
  projection, Ready To Test, and pass/rework actions share correlation and
  lineage.
- Duplicate action/lease, stale event, worker failure, verification failure,
  restart/replay, and missing approval are exercised.
- `/pipeline` alone explains current state, blocker, next action, truth level, and
  evidence refs.
- No provider call, live worker, secret, raw payload, tmux/log dependency, GitHub
  mutation, merge, or cleanup is required.

**Stop if:** any stage is pre-seeded to bypass the behavior under test, two
systems disagree on lifecycle, or fixture/simulated state is labeled live.

### Gate 5 — MVP closeout

- Epics 1-4 are assessed against fresh exact-ref results.
- Epic 3 remains open until Gate 4 passes; then the source-owned closeout is
  corrected to the exact demonstrated boundary.
- Stale generated tracker rows are reconciled as history without dispatch.
- Epic 25 is recorded as contract scaffolding/held operation, not live proof.
- Final report says either “MVP integrated local proof passed” or names the exact
  blocker; it does not create follow-on work automatically.

### Gate 6 — Optional bounded-live/post-MVP entry

- A separately approved source-owned PRD names exact user value that requires
  live execution.
- Supported runtime/provider, host, identity, telemetry source, budget, data
  boundary, rollback controller, and operator owner are real and verified.
- Readiness inputs are independently resolvable receipts; fixture evidence cannot
  produce live/go.
- One canary passes before any capacity increase; every ramp stage is separately
  authorized and abortable.

**Stop if:** the reason is “prove production,” “use six workers,” tracker
continuity, or worker utilization rather than a product outcome.

## Explicit global stop/hold conditions

Keep the system in **hold** and do not create/dispatch/claim production or next-
epic work when any of the following is true:

- source bundle, product goal, supersession, or exact baseline is ambiguous;
- the primary or target worktree has unowned changes or unexplained deletion;
- evidence is fixture, simulated, caller-declared, stale, contradictory,
  unresolvable, or from a different target/run/ref;
- approval is not server-bound to exact actor/action/target/version/expiry;
- lifecycle truth differs between manager, supervisor, database, and dashboard;
- a check is skipped, interrupted, sandbox-blocked, or only historically claimed;
- the supported database/deployment topology differs from the tested topology;
- auth/network trust boundary, secret handling, rollback, telemetry, budget, or
  operator ownership is missing;
- restart/replay leaves ambiguous state, duplicate ownership, or silent retry;
- any provider call, live worker launch, production mutation, deployment, merge,
  cleanup, credential access, or network expansion lacks exact authority;
- resource, usage, error, latency, cost, freshness, or evidence thresholds are
  absent or breached;
- no authoritative backlog remains and no explicit unmet requirement or newly
  approved source-owned PRD exists.

## Final posture for future sessions

- Product phase: **pre-alpha local development control plane**.
- Durable architecture direction: **supervisor-owned truth, dashboard operator
  surface, governance and manager adapters around explicit authority**.
- Operational action foundation: **substantially delivered**.
- Ready To Test pass/fail/rework: **delivered for bounded local use; bounded local
  approval binding is corrected, while stronger remote authority still requires
  an authenticated server-bound session**.
- Runtime ports: **local/fake metadata proof delivered; live substrate not proven**.
- Minimum source-backed operational loop: **not yet proven end to end**.
- Epics 1-4: **foundation mostly delivered; Epic 3 acceptance remains open**.
- Generated Epics 5-24: **implementation history/status drift, not authoritative
  product scope**.
- Epic 25: **delivered contracts/evidence scaffolding on local `origin/dev`;
  fixture-fed `go` weakness; no live canary/ramp/recovery proof**.
- Production decision: **hold**.
- Epic 26: **must not exist under the current source bundle**.
- Immediate next outcome: **integrated local proof**; Gate 4/MVP proof is not
  complete, and broader remote mutation routes remain follow-up debt.

## BMAD-Supported Execution Record

### Completion note — 2026-07-12

Final runtime evidence: refill exited 1 with
`authoritative_backlog_exhausted` / no dispatch / no-new-epic; preflight exited 1
due stale-owner attention; resume exited 1 with ambiguous stale assignments;
stale inspection/preservation exited 0 with 12/12 preserved and 0 cleanup/takeover
candidates.

This correction is to be executed through the repository's BMAD lifecycle:

`bmad-sprint-planning -> bmad-create-story -> bmad-dev-story -> bmad-code-review -> review fixes -> bmad-correct-course when needed -> bmad-retrospective`

BMAD role mapping for future sessions:

- **Analyst/PM:** reconcile the PRD, architecture, epics, tracker, delivered
  source, and debt register before proposing scope.
- **Course correction:** produce a bounded proposal for named unmet
  requirements, contradictions, or failed acceptance gates; never manufacture
  an epic for worker utilization.
- **Architect:** choose the canonical lifecycle owner and record authority,
  provenance, topology, rollback, and stop-line decisions in source-owned ADR or
  workflow material.
- **SM/planning:** reconcile tracker state and create only approved stories with
  explicit acceptance criteria, verification, and completion boundaries.
- **Developer worker:** implement each story in a governed lane and preserve
  source/evidence boundaries.
- **Code review/QA:** review implementation, route fixes, rerun focused checks,
  and repeat until clean or explicitly gated.
- **Delivery/retrospective:** merge and clean up through the workspace protocol,
  then record lessons and remaining risk without retaining raw provider data.

Correction work must remain ordered: establish a clean baseline and source
hierarchy; stop automatic refill; bind approvals server-side; prove the
integrated local loop; tighten evidence semantics; define supported topology;
then address maintainability and any separately approved bounded-live work.

BMAD outputs remain local planning state. A decision becomes durable across
clean sessions only when rewritten into source-owned docs, tests, scripts, or
policy. No new Epic 26 or post-slice story is valid until a source-owned product
outcome and acceptance boundary exist.
