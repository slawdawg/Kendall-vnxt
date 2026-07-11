# ADR: Current Product Slice and Authority

Date: 2026-07-11  
Status: accepted for Gate 0/1; documentation decision only  
Scope: source authority, lifecycle ownership, completion evidence, and the next correction sequence

## Context

Kendall vNxt is a pre-alpha, local-first development control plane. Its durable
goal is to turn operator-selected product work into a progressively automated,
auditable path through planning, implementation, verification, review,
delivery, and cleanup while stopping for meaningful decisions and authority
changes. The existing product brief describes that integrated path and requires
autonomy to be earned through evidence and safe defaults
(`docs/product/kendall-vnxt-orchestrator-product-brief-2026-06-10.md:L12-L18`,
`:L32-L36`).

Pre-alpha permits narrow, fixture-backed, read-only, and visibly rough slices.
It does not permit hidden mutation, unclear ownership, missing recovery,
weakened evidence, or implicit authority expansion (`AGENTS.md:L271-L295`).
The current Gate 0/1 slice therefore resolves product truth and authority only.
It changes no runtime behavior and proves no live or production capability.

## Decision

### 1. Durable product boundary

The current product is one local operator control plane with three distinct
responsibilities:

- The supervisor service is the canonical runtime system of record. It owns
  work-packet identity, lifecycle state and transitions, queue state, approval
  decisions, execution evidence, and terminal outcomes. Its persisted event
  history and current-event concurrency boundary are the only canonical
  lifecycle truth (`docs/architecture/kendall-vnxt-overall-architecture.md:L100-L115`;
  `services/supervisor/src/supervisor/application/service.py:L1253-L1283`).
- The dashboard is an operator-facing projection and command-request surface.
  It displays supervisor truth, gathers operator intent, and submits requests.
  It does not infer, mint, or persist independent workflow truth or authority
  (`docs/architecture/kendall-vnxt-overall-architecture.md:L117-L137`).
- The manager and BMAD integration are adapters. BMAD elicits and structures
  planning inputs; the manager selects, deduplicates, and proposes bounded work
  to the supervisor. Neither owns a parallel lifecycle ledger, promotes its own
  output to product truth, approves its own request, or reports a stronger
  completion state than supervisor evidence supports. BMAD output enters as
  Draft or Candidate work and execution gates still apply
  (`docs/product/kendall-vnxt-orchestrator-product-brief-2026-06-10.md:L58-L83`).

This ownership model is the target contract. Where current implementation
differs, the discrepancy is correction work, not permission to reinterpret the
contract.

### 2. Resolved source hierarchy

For clean-install review, conflicts are resolved in this order:

1. Accepted, source-owned ADRs and specific workflow/authority contracts define
   product intent, ownership, safety boundaries, and allowed claims. This ADR
   governs the current slice.
2. Source-owned shared contracts, supervisor code, schemas, and migrations
   define behavior that is actually implemented. The supervisor's persisted
   lifecycle record governs the current state of a particular work packet.
3. Source-owned tests and verification scripts prove only the behavior they
   exercise. A green fixture or unit test cannot enlarge authority or establish
   live/production evidence.
4. Source-owned README files, runbooks, reports, and dashboard copy explain and
   project the layers above; they do not override them.
5. Ignored `_bmad-output/**` PRDs, addenda, architecture drafts, epics, stories,
   sprint status, reviews, retrospectives, research, decision logs, and handoffs
   are local planning inputs. They may identify candidate scope and acceptance
   criteria, but are not independent product truth, runtime truth, approval, or
   clean-install dependencies. A durable decision must be rewritten into
   source-owned docs, code, contracts, or tests
   (`docs/workflows/planning-doc-clean-install-boundary.md:L1-L18`;
   `docs/workflows/product-requirements-boundary.md:L71-L81`).

Accordingly, a local PRD or epics file may be called *selected* or
*authoritative planning input* within one manager run, but never an
authoritative product source by itself. If source-owned intent and implemented
behavior disagree, use the more restrictive authority interpretation, cap the
evidence claim at what is implemented and observed, and open correction work.

### 3. Evidence and completion vocabulary

These labels are cumulative and must not be used interchangeably:

| Label | Required meaning |
| --- | --- |
| `done` | The bounded source-owned slice meets its stated acceptance criteria, review obligations, and scoped verification. It may be documentation-only or fixture-backed. It makes no integration, live, deployment, or production claim. |
| `integrated_local` | On a clean local install, the real supervisor-owned lifecycle, manager/BMAD adapter, and dashboard projection complete the named bounded path together, with persisted supervisor events and reproducible local evidence. Mocks may support tests but cannot be the evidence for this label. No provider, remote delivery, or production claim is implied. |
| `bounded_live` | One explicitly approved, server-bound operation used the named real worker, provider, network, or delivery path within an exact scope, expiry, rollback, and retention envelope. Fresh supervisor evidence records the actual attempt and result. This is not general enablement or production proof. |
| `production_observed` | The approved production deployment executed the named path and production telemetry/audit evidence observed its result. Local, fixture, staging, dry-run, readiness, or approval evidence cannot satisfy this label. |

Evidence is metadata plus durable references to the proving artifact. A status,
dashboard rendering, approval request, planned command, synthetic fixture, or
terminal event is evidence of itself only. In particular, terminal status is
not execution authority (`docs/architecture/kendall-vnxt-execution-readiness-and-evidence-policy-2026-06-08.md:L40-L73`).

### 4. Authority and stop lines for Gate 0/1

This ADR grants no runtime authority. During Gate 0/1:

- no secret, credential, token, session, browser profile, or credential-store
  access;
- no local, remote, paid, or subscription provider call and no provider/model
  enablement;
- no worker/process launch, production deployment, release automation, external
  runtime/product delivery or merge, cleanup, or destructive operation;
- no approval inferred from UI state, client input, evidence-ref text, planning
  status, readiness, or a prior approval for another target;
- no automatic Epic 26 creation, successor epic creation, course-correction
  backlog materialization, or refill merely to keep workers busy; and
- no source, code, test, runtime, or BMAD artifact change in this slice beyond
  this ADR.

These runtime/product stop lines do not prohibit governed source PR delivery of
this ADR itself. After the documentation gates pass, the ADR may be committed,
pushed, reviewed, and merged through the repository's normal source-delivery
policy. That delivery grants no runtime authority and does not permit cleanup or
other destructive operations.

Future approval must be server-bound: the supervisor validates and persists an
operator decision against the exact operation, target, source revision,
authority family, scope, evidence, expiry, rollback, and current lifecycle
event. The dashboard and manager may request approval but cannot manufacture or
accept it. Existing execution contracts likewise treat readiness packets as
non-executing and require exact successor approval
(`docs/workflows/execution-authority-boundary.md:L1-L5`, `:L87-L122`).

### 5. `authoritative_backlog_exhausted`

`authoritative_backlog_exhausted` is the successful terminal outcome for a
manager run against one resolved source bundle when the supervisor has
reconciled that bundle and finds no eligible, queued, leased, running,
review-fix, required retrospective, or otherwise required work remaining, and
no separately approved authoritative source is available.

Entering it must be idempotent and must:

1. persist a supervisor-owned terminal event with the source identity/revision,
   reconciled item counts, unresolved approval-gated items, and evidence refs;
2. stop dispatch, refill, planning continuation, epic/story invention, and
   worker launch for that run;
3. project the terminal state and its resume requirement honestly in the
   dashboard; and
4. leave approval-gated work visibly gated rather than silently converting it
   into safe backlog.

It is not failure, idle polling, `no_safe_work`, or permission to synthesize
more scope. The terminal run does not reopen. Continuation requires a new run
bound to either newly accepted source-owned backlog or an operator-selected
planning bundle whose product decisions have been accepted into the
source-owned boundary. Any execution still requires its own server-bound
authority. This replaces the idea that sprint exhaustion should automatically
produce a refill or course-correction backlog; the existing refill vocabulary
currently lacks this terminal result
(`packages/contracts/src/manager-control-plane/refill.ts:L5-L24`).

### 6. Current correction sequence

Later implementation slices must proceed in this dependency order:

1. **Source hierarchy** — make all intake and status language obey the resolved
   hierarchy above.
2. **Refill terminal state** — add and enforce
   `authoritative_backlog_exhausted`; remove automatic post-exhaustion work
   invention.
3. **Server-bound approval** — make supervisor validation, persistence,
   freshness, and exact-target binding mandatory before gated transitions.
4. **Honest integrated MVP loop** — connect BMAD/manager intake, canonical
   supervisor lifecycle, worker result, and dashboard projection locally
   without split truth or simulated completion claims.
5. **Evidence semantics** — enforce the four labels and reject claim inflation.
6. **Topology** — only then simplify process, queue, API, and deployment
   topology around the proven ownership model.
7. **Maintainability** — reduce duplication and legacy paths after topology and
   contracts are stable.

No later item may be used to bypass an earlier gate.

## Acceptance gates

Gate 0 is accepted when this source-owned ADR is the only changed file, survives
a clean clone, resolves product/source/lifecycle ownership, and labels local
PRDs and epics as planning inputs rather than product truth.

Gate 1 is accepted when this ADR also defines the four evidence labels, the
server-bound approval boundary, the terminal exhaustion behavior, stop lines,
and the ordered correction sequence; Markdown references and the repository's
clean-install documentation boundary checks pass. Gate 1 is a documentation
gate only. It does not claim that current code implements the decisions.

Any future slice may claim `done` only with scoped verification. It may claim
`integrated_local`, `bounded_live`, or `production_observed` only with the
corresponding evidence defined above. Missing or contradictory evidence lowers
the claim; it never becomes a waiver.

## Supersession and updates

- Only a reviewed source-owned ADR may supersede this decision. It must name
  this file, the changed decisions, rationale, migration/correction impact, and
  effective date. Local BMAD output cannot supersede it.
- Narrow clarifications may update this ADR in place with a new date and an
  explicit change note. Changes to ownership, authority, terminal behavior, or
  evidence meanings require a superseding ADR.
- Code or tests that conflict with this ADR do not silently amend it. Until a
  reviewed source-owned reconciliation lands, apply the more restrictive stop
  line and report the mismatch.
- Path/line citations are review aids; the cited source path and decision are
  authoritative if line numbers drift.
