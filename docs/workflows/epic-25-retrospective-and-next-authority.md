# Epic 25 Retrospective and Next Authority

Date: 2026-07-12
Implementation baseline: `883fc7b100ec620323980a8e8a46e0f80c13176d`

Planning digest-set identity:

- PRD: `sha256:5dba66bf42d1962e494ca3b75379b6e2ad35348510f034fde4592a77bccab18f`
- Epics: `sha256:88f7b2c25360306b53e292a1575a634b4d610d21de605c4c74376a0c39618ea5`
- Implementation readiness: `sha256:32c6e8fabdb34366a64e9d4581b0fd08553a20440e4965603ba48d6c94f2cb96`
- Sprint status: `sha256:7cde9f5762c29e2b222ae4cbfb5565d181f1f9e8cd83da860be487eb2a286fe4`

The Git commit is the implementation baseline and planning-run provenance
marker. It does not contain the ignored local BMAD planning bundle. The four
digests above, taken together, are the content identity for the reconciled
planning set discussed here.

## Durable outcome

Epic 25 completed six source-owned contract, evaluator, projection, fixture,
and local-proof implementation slices. The reconciled planning bundle contains
five epics and 24 stories, and its tracker labels all current stories `done`.
For Epic 25, `done` records completion of those implementation slices; it does
not mean that the original live acceptance criteria passed. Its bounded success
is the `integrated_local` Gate 4 path: local BMAD resolution, metadata-only
manager intake, supervisor-owned lifecycle truth, local worker-result
continuation, restart/persistence proof, and matching `/pipeline` projections.

## Acceptance criteria and evidence disposition

This correction does not alter, weaken, replace, or waive the original Epic 25
acceptance criteria. The acceptance-boundary summaries below are evidence
indexing aids, not replacement criteria. Delivery records
[#473](https://github.com/slawdawg/Kendall-vnxt/pull/473) through
[#478](https://github.com/slawdawg/Kendall-vnxt/pull/478) prove the bounded
implementation scope described below. Tracker or story-file labels are
planning state, not proof that a live gate passed.

| Story | Original acceptance boundary | Evidence actually retained | Durable disposition |
| --- | --- | --- | --- |
| 25.1 Operational Readiness Contract | Evaluate machine-checkable source, authority, recovery, resource/cost, secret, retention, rollback, SLO, telemetry, alert, and go/no-go gates; fail closed when evidence is missing or unsafe. | Schema, evaluator, typed blockers, manager integration, and source-owned regression tests. | Contract implementation slice complete. No live authority granted. |
| 25.2 One-Worker Live Canary | Execute one explicitly authorized worker against the selected live substrate, capture live telemetry and lease/checkpoint evidence, and stop or roll back on any threshold or authority breach. | Metadata-only canary evidence schema, builder, validator, hold-state projection, and fixtures. | Contract implementation slice complete; live gate deferred and unmet. No approved live worker/provider/substrate canary evidence exists. |
| 25.3 Live Capacity Ramp | Run approved stages one at a time, normally 1 -> 2 -> 4 -> 6 workers, recording observed queue/lease, latency, errors, resources, usage, and cost; halt or roll back on breach. | Ramp schema, builder, validator, pass/breach fixtures, and hold-state projection. | Contract implementation slice complete; live gate deferred and unmet. No staged worker execution or observed live cost/resource telemetry exists. |
| 25.4 Resilience and Recovery Validation | Run restart, worker-death, stale-lease, timeout, verification, pause/drain, handoff, and recovery drills over the proven live path, preserving ownership and recovery evidence. | Recovery evidence schema plus local restart, replay, lease, and ambiguity proof. | Partial local proof; live-path drill gate deferred and unmet. |
| 25.5 Operational Hardening and Runbooks | Convert scale and resilience evidence into owned alerting, authority, secret, resource/cost, rollback, incident, support, retention, and cleanup controls and verified runbooks. | Hardening-domain schema, builder, validator, high-risk-gap fixtures, and stop-state projection. | Contract implementation slice complete; live-derived closure and operator-run runbook verification are deferred and unmet. |
| 25.6 Production Readiness Decision | Audit readiness, canary, scale, resilience, and hardening packets into exactly one `go`, `hold`, or `limited_rollout` decision; forbid full go when required live evidence is absent. | Decision schema, predecessor aggregation, evaluator, fail-closed projection, and regression tests. | Contract implementation slice complete. `hold` is the only defensible current decision; no rollout authority or live/production readiness is proven. |

The local story records for 25.2 through 25.5 use a generic bounded-slice
template instead of the original Epic 25 criteria; 25.3 through 25.5 also
retain `review` labels while the reconciled tracker says `done`, and the 25.1
through 25.5 task checklists remain unchecked. Those local planning
discrepancies remain visible debt. They cannot be used to upgrade contract or
fixture evidence to live evidence.

## What held

- Existing lifecycle and evidence contracts were extended instead of replaced.
- Readiness, recovery, hardening, and final decisions fail closed on missing,
  stale, contradictory, simulated-only, or unsafe evidence.
- Evidence remains metadata-only, with no secrets, credentials, raw provider
  payloads, or unnecessary source copies.
- Gate 4's accepted boundary and stop lines are explicit and inspectable.

## Technical debt

- Story-file labels, checklists, and generic acceptance-criteria templates
  still need local planning hygiene; this must preserve the original Epic 25
  criteria and must not reopen source scope.
- Source hierarchy, planning digest-set identity, implementation baseline,
  exact reconciliation, terminal persistence, and intake provenance must
  remain one coherent authority chain without conflating Git history with
  ignored planning content.
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
   digest-set identity across planning, status, intake, and evidence, while
   recording implementation Git baselines separately.
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
