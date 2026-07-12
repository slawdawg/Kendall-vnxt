# Integrated-Local Cross-Consumer Proof

Date: 2026-07-12

## Scope and result

This is the source-owned delivery record for the canonical pipeline contract
across contracts, workflow core, supervisor, manager, and the `/pipeline`
dashboard consumer. The exact verified source commit was
`d9d43aefb8b76eaa05a2b17b202f8f58710c1df4` (`dev` after PRs #543 through
#547). The proof worktree was clean before this document was created.

Outcome: **passed, `integrated_local` only.** The named local path is accepted
as a metadata-only, disposable-local proof. It is not a `bounded_live` or
`production_observed` claim and grants no execution authority.

## Command and result matrix

All commands below were run from the proof worktree at the verified commit and
completed with exit status 0.

| Command | Result |
| --- | --- |
| `pnpm run test:work-packet-contracts` | pass — 1 test, 0 failures |
| `node --test tests/pipeline-control-plane-lifecycle.test.mjs tests/operational-readiness-contract.test.mjs tests/manager-supervisor-source-intake.test.mjs` | pass — 3 files, 0 failures |
| `uv run --directory services/supervisor pytest tests/integration/test_work_packets.py` | pass — 59 collected integration tests |
| `node --test tests/pipeline-active-board-view-model.test.mjs tests/dashboard-pipeline-fixtures.test.mjs` | pass — 2 files, 0 failures |
| `pnpm run test:pipeline-operational-smoke` | pass — supervisor-owned disposable-local action-loop proof |
| `pnpm run check:dashboard-pipeline-boundary` | pass — 6 dashboard files; no direct provider, shell, filesystem, GitHub, Obsidian, runner, cleanup, or live-network access outside the read-only supervisor projection loader |
| `pnpm run check:static-manager` | pass — focused 11-command manager bundle, including serialized control-plane coverage and manager boundary checks |
| `pnpm run check:static-pipeline-dashboard` | pass — focused 11-command pipeline/dashboard bundle |
| `git diff --check` before artifact creation | pass — no whitespace errors |

The static pipeline/dashboard bundle also reported the intentional readiness
state `NOT_READY` with `readyForImplementation=false` and
`executionAuthorityApproved=false`; its bundle status was still pass because
that unresolved live authority is an expected, fail-closed condition.

## Structured canonical evidence

The canonical contract is `pipeline-canonical-contract/v1`, with the
supervisor as the authoritative source. The tested consumer chain is:

```text
canonical contract / workflow core
  -> supervisor WorkPacket lifecycle and persisted event truth
  -> manager canonical-supervisor intake and readiness projection
  -> read-only dashboard WorkPacketV0 list/detail and active-board projection
```

The proof establishes these durable facts:

- The ten authoritative stages remain ordered from `capture` through `learn`;
  contract and workflow-core exports remain namespaced and metadata-only.
- The supervisor provides canonical source, quality gate, readiness, product
  mode, capability, queue, worker, evidence, and projection fields. Invalid,
  stale, contradictory, non-canonical, or retention-unsafe fields fail closed;
  consumers do not infer missing authority or use a fallback truth source.
- Manager intake retains the supervisor’s authoritative terminal event and
  preserves a canonical `no_go` where manager-local context disagrees with a
  gated backend capability.
- The local smoke uses a real supervisor route and disposable SQLite state,
  requests server-bound approval for gated actions, and verifies persisted
  lifecycle/projection lineage, rework lineage, replay/rebuild, engine reload,
  stale/missing approval rejection, lease fencing, idempotency, and public
  local-proof forgery rejection.
- Smoke evidence is metadata-only: `evidenceLevel=integrated_local`,
  `metadataOnly=true`, and `rawPayloadRetained=false`. It also asserts the
  canonical packet/WorkItem state agreement and the server-created local-proof
  attestation/capability boundary.
- Dashboard list/detail and active-board tests consume the canonical projection
  without fixture substitution for the named contract surface; the import
  boundary confirms that `/pipeline` remains read-only with respect to the
  prohibited external and mutating interfaces.

## WIP, action, and terminal invariants

- **WIP/backpressure:** execute admission carries the supervisor policy version
  `supervisor-wip/v0`, capacity availability, and active/dispatchable/blocked/
  gated/closed/stale/refilling/unknown counts. Consumers project that truth;
  they cannot independently admit work when capacity or canonical validity is
  missing.
- **Action:** operational action requests/results are capability-gated,
  approval-bound, idempotent, and metadata-only. Missing or stale approval,
  stale lease/action fencing, unsafe metadata, forged canonical linkage, and
  public local-proof attempts are rejected. The dashboard exposes typed
  capability state and reason, not an implied live control.
- **Terminal:** manager preserves a canonical supervisor terminal event rather
  than fabricating a terminal state. Invalid canonical state stops the
  source-backed seed; blocked, held, review, rework, and closed outcomes retain
  event/evidence lineage. A blocked approval packet identifies `operator` as
  its unblocker; a non-approval execute blocker retains `unknown` rather than
  falsely attributing it to the operator.

## Warnings and explicit deferrals

- This proof did not call a provider, start an external worker, dispatch work,
  mutate a source, perform production or live-canary activity, run a schema
  migration, or make an external mutation.
- Readiness is deliberately not live-ready. The static readiness report retains
  one future-blocked risk for runtime enforcement/writeback authority and
  explicitly blocks canonical Obsidian/source mutation, worker/provider calls,
  GitHub/network actions, raw/source-copy retention, and LLM-Wiki promotion.
- Epic 25 live gates remain unmet: 25.2 has no authorized real one-worker
  canary or observed live telemetry; 25.3 has no staged 1→2→4→6 live capacity
  ramp or live cost/resource measurements; 25.4 has no live-path resilience or
  recovery drill; 25.5 has no live-derived hardening closure or operator-run
  runbook verification; and 25.6 remains `hold`, with no rollout authority or
  production-readiness proof. Those deferrals are not weakened by this local
  result.

## Interpretation

`integrated_local` is accepted only for the bounded cross-consumer path stated
above. It demonstrates consistent source-owned canonical truth and durable
metadata-only evidence across the named local consumers. It does not authorize
or prove any live, provider, production, delivery, merge, cleanup, or external
runtime operation.
