# Kendall_vNxt Architecture Gap Review

Date: 2026-06-08
Reviewed artifact: `docs/architecture/kendall-vnxt-overall-architecture.md`
Review methods: `bmad-review-adversarial-general`, `bmad-review-edge-case-hunter`
Status: findings recorded; no architecture changes applied in this review artifact

## Executive Summary

The consolidated architecture document is a strong baseline, but it is still a spine, not a complete implementation architecture. The largest gap is not vision; it is operational specificity around execution authority, state ownership, worker lifecycle, failure handling, and reviewable contracts between governance, supervisor, dashboard, and workers.

The highest-value next move remains an Execution Authority Expansion PRD, but that PRD should be constrained by the gaps below rather than becoming a generic "launch agents" plan.

## Adversarial Review Findings

1. `docs/architecture/kendall-vnxt-overall-architecture.md:28-61` - The architecture diagram shows the governance layer beside the runtime flow, but it does not define the control relationship between governance decisions and supervisor runtime enforcement. A future implementer could treat governance as documentation only instead of a policy input.

2. `docs/architecture/kendall-vnxt-overall-architecture.md:65-78` - The Chief of Staff / governance coordinator section defines responsibilities, but not input/output contracts. It does not say what artifact shape the coordinator emits, how the supervisor consumes it, or how conflicting governance records are resolved.

3. `docs/architecture/kendall-vnxt-overall-architecture.md:80-95` - The supervisor owns many responsibilities, but there is no explicit state model. Work item state, route decision state, worker attempt state, approval state, and cancellation state are implied rather than named.

4. `docs/architecture/kendall-vnxt-overall-architecture.md:97-111` - The dashboard section says it is not the source of truth, but does not identify the exact read/write boundary. It is unclear which dashboard actions are commands, which are views, and which require supervisor-side validation.

5. `docs/architecture/kendall-vnxt-overall-architecture.md:113-117` - Shared contracts and workflow-core are described too lightly. The doc does not define which concepts belong in `packages/contracts` versus `packages/workflow-core` versus `services/supervisor` domain code.

6. `docs/architecture/kendall-vnxt-overall-architecture.md:119-138` - Dynamic routing is called feature-complete for the safe foundation phase, but the document does not define a formal acceptance boundary for that phrase. That creates risk that later work misreads "feature-complete" as "ready for real worker execution."

7. `docs/architecture/kendall-vnxt-overall-architecture.md:140-151` - Execution lanes are useful but under-specified. Each lane needs explicit allowed operations, forbidden operations, required evidence, authority mode, and promotion criteria to the next authority level.

8. `docs/architecture/kendall-vnxt-overall-architecture.md:153-165` - The authority ladder is directionally right, but it lacks gate criteria. It says no step should skip safety contracts, but does not say what concrete evidence must exist before moving from one rung to the next.

9. `docs/architecture/kendall-vnxt-overall-architecture.md:167-183` - Runtime assistant behavior remains disabled, but the document does not define how disabled behavior is technically enforced. There is no mention of feature flags, disabled endpoints, config defaults, startup checks, or test assertions.

10. `docs/architecture/kendall-vnxt-overall-architecture.md:185-210` - Recovery boundaries explain tracked versus ignored state, but do not define runtime backup/export strategy for local databases, queue state, routing evidence, or audit events. Recoverable source is covered; recoverable operational state is not.

11. `docs/architecture/kendall-vnxt-overall-architecture.md:212-223` - Safety principles are strong but not mapped to verification. Each principle should identify the enforcing layer, expected test coverage, and evidence artifact.

12. `docs/architecture/kendall-vnxt-overall-architecture.md:225-240` - Current completion state mixes implemented capabilities and documented decisions. That is readable, but not audit-clean. The doc should distinguish code-backed, test-backed, doc-backed, and decision-backed states.

13. `docs/architecture/kendall-vnxt-overall-architecture.md:242-252` - Deferred items are listed, but no dependency graph exists. Direct subscription launch, local provider calls, premium execution, and adaptive routing each depend on different prerequisites.

14. `docs/architecture/kendall-vnxt-overall-architecture.md:254-265` - The recommended next move names the right PRD, but the PRD scope is too broad unless split into staged subdomains: lifecycle, workspace isolation, command execution, approvals, cancellation, rollback, and observability.

15. Whole document - There is no explicit threat model. The architecture talks about safety, but does not enumerate trust boundaries, actor roles, attack surfaces, prompt injection paths, command injection paths, secret exposure paths, or local network provider risks.

16. Whole document - There is no observability architecture. Events are mentioned, but the doc does not define required event taxonomy, correlation IDs, attempt IDs, log retention, evidence packet retention, or operator audit views.

17. Whole document - There is no concurrency model. Queue depth, worker capacity, cancellation, duplicate dispatch, stale attempts, and simultaneous operator actions are not addressed.

18. Whole document - There is no configuration architecture. Provider enablement, disabled defaults, per-lane authority, endpoint URLs, model lists, and operator approval policy need a named config source and precedence order.

## Edge Case Hunter Findings

```json
[
  {
    "location": "docs/architecture/kendall-vnxt-overall-architecture.md:28-61",
    "trigger_condition": "Governance and supervisor disagree on permitted execution",
    "guard_snippet": "Require supervisor policy check against latest accepted governance decision before dispatch.",
    "potential_consequence": "Runtime executes work governance intended to block."
  },
  {
    "location": "docs/architecture/kendall-vnxt-overall-architecture.md:65-78",
    "trigger_condition": "Multiple governance records conflict",
    "guard_snippet": "Define precedence: latest accepted durable decision wins unless superseded explicitly.",
    "potential_consequence": "Agents pick convenient stale policy."
  },
  {
    "location": "docs/architecture/kendall-vnxt-overall-architecture.md:80-95",
    "trigger_condition": "Worker attempt starts then operator cancels work item",
    "guard_snippet": "Persist cancellation state and require adapters to poll or receive cancel signal.",
    "potential_consequence": "Canceled work continues mutating state."
  },
  {
    "location": "docs/architecture/kendall-vnxt-overall-architecture.md:80-95",
    "trigger_condition": "Same work item is dispatched twice",
    "guard_snippet": "Use attempt leases with idempotency keys and single-active-attempt invariant.",
    "potential_consequence": "Duplicate workers race and corrupt outputs."
  },
  {
    "location": "docs/architecture/kendall-vnxt-overall-architecture.md:97-111",
    "trigger_condition": "Dashboard sends stale approval after route changes",
    "guard_snippet": "Require approval commands to include routeDecisionId and reject stale IDs.",
    "potential_consequence": "Wrong lane receives valid-looking approval."
  },
  {
    "location": "docs/architecture/kendall-vnxt-overall-architecture.md:140-151",
    "trigger_condition": "Disabled provider endpoint is accidentally reachable",
    "guard_snippet": "Gate provider calls behind explicit enabled=true policy and startup assertion.",
    "potential_consequence": "Disabled local model executes unexpectedly."
  },
  {
    "location": "docs/architecture/kendall-vnxt-overall-architecture.md:153-165",
    "trigger_condition": "Authority ladder promotion lacks required evidence",
    "guard_snippet": "Define promotion checklist with tests, audit events, rollback, and approval records.",
    "potential_consequence": "Execution authority expands by implication."
  },
  {
    "location": "docs/architecture/kendall-vnxt-overall-architecture.md:167-183",
    "trigger_condition": "Startup automation exists while runtime assistant behavior disabled",
    "guard_snippet": "Add startup preflight that fails if disabled runtime behaviors are configured.",
    "potential_consequence": "Background behavior runs outside explicit task turns."
  },
  {
    "location": "docs/architecture/kendall-vnxt-overall-architecture.md:185-210",
    "trigger_condition": "Machine loss occurs with important queue state only in local DB",
    "guard_snippet": "Define export/backup policy for queue, events, decisions, and audit evidence.",
    "potential_consequence": "Source recovers but operational history is lost."
  },
  {
    "location": "docs/architecture/kendall-vnxt-overall-architecture.md:212-223",
    "trigger_condition": "Prompt includes secrets in evidence packet",
    "guard_snippet": "Add redaction pipeline and denylist tests before any worker prompt construction.",
    "potential_consequence": "Secrets leak into model or artifacts."
  },
  {
    "location": "docs/architecture/kendall-vnxt-overall-architecture.md:242-252",
    "trigger_condition": "Adaptive scoring enabled before enough outcome evidence exists",
    "guard_snippet": "Require minimum sample thresholds and manual review before adaptive weights apply.",
    "potential_consequence": "Bad routing decisions become self-reinforcing."
  },
  {
    "location": "docs/architecture/kendall-vnxt-overall-architecture.md:254-265",
    "trigger_condition": "Execution PRD combines all authority domains at once",
    "guard_snippet": "Split execution authority into lifecycle, isolation, command, approval, rollback stories.",
    "potential_consequence": "PRD becomes too broad to implement safely."
  }
]
```

## Gap Categories

### Must Fill Before Execution Authority Expansion

- Supervisor state model for work items, route decisions, attempts, approvals, cancellation, and outcomes.
- Worker lifecycle contract covering start, heartbeat, timeout, cancel, completion, failure, artifact capture, and cleanup.
- Workspace isolation model covering source copy/branch rules, writable paths, secret exclusion, and rollback.
- Approval command contract with stale-decision protection.
- Configuration model for disabled defaults, provider enablement, lane authority, endpoint URLs, and policy precedence.
- Observability model with correlation IDs, attempt IDs, event taxonomy, log retention, and audit views.
- Threat model for local commands, model prompts, provider endpoints, prompt injection, command injection, and secret leakage.

### Should Fill Soon

- Dashboard command/read boundary.
- Contracts versus workflow-core ownership rules.
- Completion-state evidence classification: code-backed, test-backed, doc-backed, decision-backed.
- Runtime database backup/export policy for recoverable operational state.
- Lane-specific permission envelopes and promotion gates.

### Can Wait

- Adaptive scoring details.
- Real local provider quality benchmarks.
- Premium execution provider selection.
- Fleet dashboard expansion beyond current compact panel.

## Recommended Next Work

Create a focused PRD: `docs/prds/supervisor-execution-authority-expansion.md`.

Recommended PRD scope:

1. Define supervisor execution state model.
2. Define worker attempt lifecycle and cancellation contract.
3. Define workspace isolation and rollback boundaries.
4. Define approval and stale-decision protection.
5. Define event/evidence/observability requirements.
6. Keep real provider calls and process launch disabled until the above are implemented and verified.

Recommended first story after that PRD:

`Supervisor execution attempt lifecycle contract`, with no real external worker launch. It should introduce durable attempt state, attempt IDs, cancellation state, timeout semantics, and event evidence using mock/disabled workers only.

## Review Decision

The architecture document is good enough as the consolidated baseline. Do not rewrite it wholesale now.

Instead, use this gap review to drive the next PRD and add targeted architecture sections only when a gap becomes implementation-blocking.
