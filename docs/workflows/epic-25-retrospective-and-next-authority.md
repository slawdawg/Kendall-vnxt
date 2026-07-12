# Epic 25 Retrospective and Next Authority

Date: 2026-07-12
Source revision: `883fc7b100ec620323980a8e8a46e0f80c13176d`

## Durable outcome

Epic 25 completed six readiness, canary, ramp, recovery, hardening, and final
decision stories. The reconciled planning bundle contains five epics and 24
stories, all current stories done. Its bounded success is the
`integrated_local` Gate 4 path: local BMAD resolution, metadata-only manager
intake, supervisor-owned lifecycle truth, local worker-result continuation,
restart/persistence proof, and matching `/pipeline` projections.

## What held

- Existing lifecycle and evidence contracts were extended instead of replaced.
- Readiness, recovery, hardening, and final decisions fail closed on missing,
  stale, contradictory, simulated-only, or unsafe evidence.
- Evidence remains metadata-only, with no secrets, credentials, raw provider
  payloads, or unnecessary source copies.
- Gate 4's accepted boundary and stop lines are explicit and inspectable.

## Technical debt

- Story-file labels for 25.3–25.5 still need alignment with the reconciled
  sprint tracker and delivery evidence; this must not reopen source scope.
- Source hierarchy, exact revision/reconciliation, terminal persistence, and
  intake provenance must remain one coherent authority chain.
- Queue/process/API topology should be simplified only after authority and
  evidence contracts stabilize.

## Unresolved gates

`integrated_local` is the only accepted Gate 4 path. It does not establish
`bounded_live` or `production_observed`. Provider calls, external workers,
dispatch, source mutation, unattended execution, and production rollout remain
deferred or capability-gated. Fixture-backed, stale, simulated, missing, or
ambiguous evidence remains hold/stop evidence and cannot authorize a live or
production decision.

## Ordered next authority

1. **Source hierarchy:** preserve one authoritative source bundle and exact
   revision/digest across planning, status, intake, and evidence.
2. **Terminal reconciliation:** tie exhaustion and terminal outcomes to that
   source identity and preserve explicit supervisor persistence.
3. **Server-bound approval:** require fresh, exact-target, server-validated
   approval and current lifecycle evidence for future gated transitions.
4. **Topology/maintainability:** simplify queue, process, API, and legacy
   topology only after the preceding authority and evidence boundaries remain
   sound.

No Epic 26 is created from exhaustion. This document does not authorize worker
launch, provider use, dispatch, source or production mutation, unattended
execution, runtime merge authority, or cleanup authority.
