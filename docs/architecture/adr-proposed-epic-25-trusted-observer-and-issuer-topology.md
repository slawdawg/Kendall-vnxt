# ADR: Epic 25 Trusted Observer and Issuer Topology

Date: 2026-07-17
Status: **APPROVED FOR DEFAULT-DISABLED `integrated_local` SOURCE IMPLEMENTATION / LIVE OPERATION HOLD**
Scope: P4.1 local-dogfood architecture and security decision plus the bounded source slice; no live-operation authorization

## Decision status and non-authority

This is a source-owned decision packet. The 2026-07-17 Epic 25 authority
reconciliation and the Operator's 2026-07-16 source-implementation authority
packet are local planning provenance at
`_bmad-output/implementation-artifacts/epic-25-authority-reconciliation-2026-07-17.md`
and
`_bmad-output/implementation-artifacts/epic-25-source-implementation-authority-2026-07-16.md`;
they are intentionally not tracked source links. They place the current
source-slice decision ahead of older worksheet and feasibility-hold wording.
The decision authorizes only additive, default-disabled, non-production
`integrated_local` source implementation, with the readiness conditions below
as mandatory in-lane acceptance gates. It does not authorize live operation or
implementation work in this documentation lane; no verifier, issuer, or
runtime is being implemented here.

Approval record: decision ID `epic-25-local-dogfood-design-2026-07-15`,
approver `Operator`, effective date `2026-07-15`, with the companion worksheet
at `_bmad-output/implementation-artifacts/epic-25-authority-decision-worksheet-2026-07-15.md`.
The worksheet is local planning evidence; the source-owned boundary and stop
rules in this ADR remain authoritative.

This document enables none of the following: `live_observed` acceptance,
`bounded_live` claims, `production_observed` claims, provider or worker launch,
deployment, credentials, external network expansion, or live operation. It
does not grant run, merge, production, cleanup, or mutation authority. It does
not authorize a generic live command. The evidence ceiling remains
`integrated_local` only, and every missing or contradictory readiness field
returns the source slice to `HOLD`.

The current authority decision remains the [current product slice and
authority ADR](adr-current-product-slice-and-authority.md). Its source
hierarchy, server-owned lifecycle truth, and separate approval boundaries
continue to govern this decision.

## Current boundary

Epic 25 has source-owned readiness, canary, ramp, recovery, hardening, and
decision contracts, plus fixture and local-proof coverage. The pre-live
[runbook](../workflows/epic-25-pre-live-runbook.md) explicitly keeps its
harness fixture-only and ends in `hold`. The [Epic 25 retrospective and next
authority record](../workflows/epic-25-retrospective-and-next-authority.md)
records the accepted implementation boundary as `integrated_local`; it does
not establish `bounded_live` or `production_observed`.

The current evidence-chain contract already checks metadata shape, packet and
target identity, timestamps, freshness, predecessor ordering, source/evidence
reference binding, metadata-only retention, and within-chain receipt identity:

- [TypeScript evidence-chain contracts](../../packages/contracts/src/pipeline-control-plane/index.ts)
  define the `pipeline-observed-evidence-attestation/v0` shape and the six
  ordered Epic 25 packets.
- [Supervisor evidence-chain schemas](../../services/supervisor/src/supervisor/api/schemas.py)
  enforce exact packet/schema and source/evidence reference relationships.
- [Supervisor ingestion and readback](../../services/supervisor/src/supervisor/application/service.py)
  reject `live_observed` until a trusted, server-issued, cryptographically
  bound receipt can be resolved, and retain the `live_evidence_unavailable`
  blocker on readback.
- [Evidence-chain integration tests](../../services/supervisor/tests/integration/test_epic25_evidence_chain.py)
  preserve caller-forged-live rejection and mismatch coverage; the
  [TypeScript validator tests](../../tests/epic25-evidence-chain-validator.test.mjs)
  cover structural and fail-closed contract behavior.

The repository record for this boundary is the tracked [current authority
ADR](adr-current-product-slice-and-authority.md), [Epic 25 pre-live
runbook](../workflows/epic-25-pre-live-runbook.md), [evidence-chain
contracts](../../packages/contracts/src/pipeline-control-plane/index.ts),
[supervisor enforcement](../../services/supervisor/src/supervisor/application/service.py),
and [evidence-chain tests](../../services/supervisor/tests/integration/test_epic25_evidence_chain.py).
Local feasibility-hold and live-validation records under
`_bmad-output/implementation-artifacts/` are non-deliverable companion paths
for planning/evidence context only. They are not repository sources, product
truth, approval records, or clean-install dependencies; this ADR does not
modify them.

## Approved local-dogfood design — 2026-07-15

Decision ID: `epic-25-local-dogfood-design-2026-07-15`
Approver: `Operator`
Decision boundary: local, non-production, default-disabled dogfood design only

The selected topology is a **trusted attestation service** running as a process
separate from the caller and supervisor. It measures the exact authorized local
subject and issues a versioned receipt. The supervisor owns verification,
run-authorization, replay fencing, persistence, and readback. Loopback or
proxy locality is transport only and is never evidence of observer
independence. This topology is approved only for the default-disabled,
non-production `integrated_local` source slice and remains held for live use.

The approved security baseline is:

- Ed25519 signatures over RFC 8785 canonical JSON bytes.
- A versioned receipt that binds issuer/key/receipt IDs, observer identity,
  run-authorization ID, nonce, issued and expiry times, environment, exact
  target, packet schema, worker/assignment, source revision and refs, policy
  profile, evidence digest and refs, and retention policy.
- A supervisor-held public-key registry only; private keys remain in the
  attestation service and are not retained in evidence.
- Five-minute receipt TTL, 30-second maximum clock skew, and durable
  supervisor uniqueness for receipt ID and nonce.
- Existing v0 attestations remain parseable and metadata-only; every consumer
  must route v0 through a version-gated metadata-only path. There is no silent
  conversion or re-issuance to promotion-grade evidence.
- Local dogfood trust material is ephemeral or locally provisioned, never
  committed, and invalid outside the local-dogfood environment.

This list is a design summary, not a complete implementation contract. A
future implementation-readiness packet must bind observer identity,
worker/assignment, policy profile, source/evidence reference sets, retention
policy, and canonical set ordering as well as the fields listed above; omitted
values must not be inferred. It must also define the startup-disabled default,
the server-side environment/registry scope check, and negative tests proving a
copied local trust root or stale configuration cannot enable acceptance.

The reconciled authority activates only the bounded default-disabled
`integrated_local` source slice, subject to the readiness conditions below. It
does not activate provider/worker launch, deployment, credentials, live or
production mutation, merge, or cleanup. This ADR update itself is
documentation-only; it does not implement a verifier, issuer, runtime, or
cryptographic acceptance path.

For this local-dogfood decision only, the Operator owns and approves the
runtime, observer, issuer, key, trust-domain, incident, evidence/retention,
run, and final-decision boundaries. These are ownership and authority roles,
not component identities: the observer and issuer remain separate local
processes, and the supervisor must not self-attest. This assignment expires at
the local-dogfood boundary; it does not transfer to a provider, worker,
deployment, staging, production, or any bounded-live operation. The concentrated
local ownership is an explicit dogfood constraint, not evidence of independent
production trust. If a future implementation cannot establish separate
observer/issuer process identity, trust-domain control, and tamper-resistant
measurement, it remains held.

## Topology candidates considered

The architecture decision selects the **trusted attestation service** for the
local, non-production, default-disabled `integrated_local` source boundary
above. The alternatives remain recorded for auditability; none is approved for
live or production operation by this ADR.

| Candidate | Independence | Authentication | Key/trust-root management | Replay, rotation, and revocation | Operational burden | Production boundary | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| Independent external observer and issuer | Strongest separation when the observer measures the exact target and the issuer is owned by a separate trust domain. Requires an explicit independence definition; a second process alone is insufficient. | Authenticated observer-to-issuer and issuer-to-supervisor channels; caller identity and transport locality cannot substitute for receipt provenance. | Separate issuer registry, trust roots, key IDs, protected private-key custody, distribution, and owner. | Central or server-enforced nonce/run uniqueness; expiry and clock policy; staged key rotation; revocation and compromise recovery must fail closed across the relevant run boundary. | Highest: service availability, secure deployment, monitoring, incident response, and cross-domain ownership. | Must explicitly identify non-production versus production identities and telemetry. Without separate production authority, the ceiling remains `bounded_live`. | Not selected for local dogfood; retain as a future option. |
| Trusted attestation service | Observer may be independent from the supervisor while a dedicated service owns issuance. Independence depends on who controls observation, issuance, and trust-root administration. | Service identity and authenticated API plus server validation of the exact run authorization and receipt payload. | Attestation service owns or brokers keys; supervisor keeps only verification metadata and revocation state, never secret values in evidence. | Service can provide global replay fencing, but the supervisor must still enforce run/nonce uniqueness, expiry, rotation overlap, revocation, and outage behavior. | Medium to high: shared service lifecycle, availability, tenant/environment isolation, and incident response. | Cross-environment attestations need explicit environment and production identity binding; service trust cannot itself grant production authority. | **Selected for default-disabled `integrated_local` source implementation only; live use remains held.** |
| Supervisor-local issuer | Weakest observer/issuer independence if the supervisor observes and issues its own receipt. It may be acceptable only if the approval decision explicitly accepts that trust model; it cannot be called independent by naming a local component. | Local authenticated component identity and server-owned authorization, with no acceptance of caller-supplied self-attestation. | Supervisor owns key custody, trust-root loading, key IDs, and audit state; compromise of the supervisor may compromise both observation and issuance. | Local durable uniqueness is simpler, but it must still enforce nonce/run uniqueness, expiry, rotation, revocation, and compromise recovery across restart and migration. | Lowest deployment burden, highest concentration of authority and blast radius. | Must not cross the production boundary merely because it is local. Production requires separately approved observer, issuer, deployment, telemetry, and incident authority. | Rejected for this design because observer/issuer independence is required. |

The comparison supports the local-dogfood design decision above. Any future
implementation-readiness record must still state whether observer independence
is sufficient, what trust-domain separation means, and which failure or outage
behavior is acceptable. A topology that cannot answer every required field
below remains `BLOCKED` for acceptance and enablement; implementation remains
default-disabled and cannot claim stronger evidence.

## Reconciled source-implementation boundary — 2026-07-17

The reconciliation record and the 2026-07-16 source-implementation authority
packet authorize only this narrow source lane:

- additive, versioned contracts and metadata-only records for the local
  attestation slice;
- default-disabled configuration and private, owner-controlled local
  transport for `integrated_local` only; and
- deterministic canonical vectors, fail-closed negative tests, and
  supervisor-owned readback that preserves `live_evidence_unavailable`.

As part of that source lane, it must implement and prove RFC 8785/JCS-compatible
canonical vectors, exact server-owned run-authorization binding, atomic
replay/nonce/receipt persistence, key registry and revocation behavior, v0
version gating, and threat-model negative tests before any acceptance path is
enabled. Missing, contradictory, or unverifiable evidence returns the slice to
`HOLD` and keeps it default-disabled.

This reconciliation does not authorize `live_observed`, `bounded_live`, or
`production_observed` evidence; provider or worker execution; deployment;
credentials; external network expansion; or merge/cleanup. It also does not
authorize this lane to implement the verifier, issuer, or runtime. Those
remain future source work behind the readiness gates and separate live
authority.

## Recommended decision criteria

The selected design does not waive these criteria. The authorized source slice
must implement and verify all of the following before local acceptance or
enablement, and a separate authority packet is still required for any live
scope:

1. An observer that can measure the exact subject independently of the caller,
   and an issuer owner whose authority is explicit and reviewable.
2. A server-verifiable receipt with deterministic canonical bytes, explicit
   algorithm and key metadata, and no authority carried by caller prose,
   evidence refs, loopback transport, or UI state.
3. A server-owned bounded-live run authorization that precedes observation,
   binds the exact source/target/run/policy/retention scope, expires, and is
   persisted with replay-safe uniqueness.
4. Fail-closed behavior for missing, stale, future-dated, revoked, rotated,
   duplicated, mismatched, unverifiable, or compromised trust material.
5. A migration that keeps existing v0 attestations structural and
   metadata-only; v0 must not become promotion-grade evidence by conversion.
6. Named architecture, security, operator-authority, runtime, observer,
   issuer, incident, evidence-retention, and final-decision owners, with live
   authority separately approved after implementation readiness.

## Required decision fields

The future implementation-readiness approval record must resolve each field
explicitly. Blank, contradictory, caller-supplied, or inferred values keep the
implementation boundary on hold even though the local-dogfood topology choice
is recorded above. The source lane must not infer missing values from caller
prose, transport locality, fixtures, or UI state.

| Field | Required resolution |
| --- | --- |
| Observer independence and issuer ownership | Observer location, independence boundary, observer identity, issuer identity, issuer owner, trust-domain owner, and who may revoke either. State why the observer is not merely the caller or the supervisor reporting its own result. |
| Algorithm and canonical payload | The local-dogfood design baseline is Ed25519 over RFC 8785 canonical JSON. A future implementation record must confirm the version, deterministic serialization rules, encoding, allowed fields, unknown-field behavior, and digest construction without treating this ADR as source authority. |
| Key IDs, rotation, revocation, and compromise recovery | Key/issuer IDs, trust-root distribution, private-key custody, activation and overlap windows, revocation source and freshness, emergency disable behavior, historical receipt treatment, and recovery owner. Secret values must never enter evidence. |
| Server-owned bounded-live run authorization | Persistent authorization record, exact authorizer, target and source revision, run/attempt ID, policy profile, allowed operations, scope, expiry, rollback, retention, and the server check that must precede issuance and acceptance. |
| Nonce, replay, expiry, and clock policy | Nonce generation and scope, globally durable uniqueness, idempotency, allowed clock skew, trusted time source, observed/issued/checked/expiry ordering, maximum TTL, and behavior during clock or registry outage. |
| Exact binding | Canonical binding for source revision, packet schema, target/worker/assignment, run/attempt, policy profile, evidence digest, source refs, evidence refs, retention policy, environment, and receipt/attestation IDs. Define whether sets are ordered or canonicalized before signing. |
| v0 migration | Keep `pipeline-observed-evidence-attestation/v0` parseable for legacy/local fixtures but never promotion-grade. Define dual-read or explicit upgrade records, no silent re-issuance, and the exact point at which a v1 receipt can be accepted. |
| Threat model | Approved assets, trust boundaries, attacker capabilities, compromise assumptions, residual risks, incident response, and adversarial test cases from the matrix below. |
| Owners | Named architecture, security, operator-authority, runtime, observer, issuer, key, incident, evidence-custodian, retention/disposal, and final-decision owners. |
| Separate live authority | A distinct authority packet for any live canary or bounded-live operation, including environment, provider/worker path, exact source and run IDs, allowed actions, thresholds, budget, telemetry, credential owner without values, retention, rollback, expiry, and separate merge/deploy/production/cleanup decisions. |

## Threat model and fail-closed acceptance matrix

### Assets and trust boundaries

Assets are the server-owned run authorization, exact packet/run/policy
identity, source and evidence digests/refs, observer measurements, receipt
identity, issuer verification metadata, revocation state, expiry and clock
decision, and metadata-only retention record. Secrets, raw provider payloads,
prompts, completions, and full telemetry payloads are outside the retained
evidence set.

Trust boundaries are: the observed runtime or provider; the observer; the
issuer and its key custody; the supervisor verifier and persistence store; the
manager/dashboard/caller; the proxy or loopback transport; and the separate
operator authority process. The attacker may control caller input, copied
receipts, transport routing, stale records, packet fields, a compromised
issuer key, or a compromised supervisor/store. Supervisor or store compromise
is a fail-closed incident boundary: no promotion-grade result may be accepted
until state integrity, trust material, and authorization are re-established.
The attacker must not be assumed unable to exploit canonicalization, replay,
clock, key-lifecycle, or target-confusion gaps.

### Acceptance matrix

Every row is a verifier test and an operational stop rule. The receipt is not
accepted as `live_observed`; the chain remains held with
`live_evidence_unavailable` or a more specific typed blocker until the
server-side cryptographic verifier, registry, run authorization, and durable
replay fence exist and pass.

| Threat or malformed input | Required server behavior | Required proof before any future acceptance |
| --- | --- | --- |
| Forged receipt or altered signed fields | Reject signature/digest; persist no promotion-grade observation; retain no raw payload. | Adversarial forgery and bit-flip tests across every bound field. |
| Unsigned receipt | Reject even if the v0 shape, refs, timestamps, and caller identity are valid. | Negative test showing structural validity cannot create `live_observed`. |
| Wrong key, unknown key ID, or wrong issuer | Reject; do not fall back to another key, caller identity, or default trust root. | Registry allowlist, key/issuer mismatch, and unknown-key tests. |
| Wrong target or packet schema | Reject when subject target, packet schema, worker, assignment, or environment differs from the authorized subject. | Exact-target negative tests and signed-payload binding assertions. |
| Wrong run or attempt | Reject when run/attempt/authorization ID differs, including a valid receipt from another run. | Cross-run and cross-attempt replay tests with durable authorization lookup. |
| Replayed receipt or nonce | Reject duplicate receipt/attestation/nonce within and across chains, restarts, and concurrent submissions; do not make replay idempotently promote a new target. | Database uniqueness/CAS tests, restart tests, and concurrent replay tests. |
| Expired receipt or authorization | Reject after expiry or revocation; downgrade/hold and preserve the live-evidence blocker. | Boundary-time tests at expiry, registry outage, and expired authorization. |
| Future-dated receipt or authorization | Reject beyond the approved clock-skew window and reject impossible timestamp orderings. | Trusted-clock and skew tests for observed, issued, checked, and expiry times. |
| Source-mismatched receipt | Reject if source revision, source identity, or source refs do not exactly match the server-owned packet/authorization. | Source revision and ref-set mismatch tests; caller refs are non-authoritative. |
| Evidence-mismatched receipt | Reject if evidence digest or evidence refs do not match the exact canonical evidence set and retention policy. | Recomputed digest, canonical payload, ref-set, and retention-binding tests. |
| Caller self-attestation | Reject caller-created claims, copied attestations, operator prose, fixtures, or UI state as observation authority. | End-to-end test where the caller has a valid transport identity but no issuer proof. |
| Loopback/proxy confusion | Treat loopback, forwarded headers, proxy identity, or local transport as transport only; never as observer independence or issuer proof. | Proxy/forwarded-header tests and direct-vs-proxied identity tests. |
| Issuer compromise or revoked key | Fail closed for new receipts, revoke affected IDs, stop affected live decisions, and require an approved recovery/re-authorization path. Do not silently bless historical receipts. | Revocation propagation, emergency disable, incident recovery, and historical-decision tests. |
| Canonicalization ambiguity | Reject payloads with non-deterministic field order, duplicate/unknown fields, encoding or Unicode ambiguity, alternate timestamps, or mismatched digest bytes. | Golden canonical vectors, cross-language vectors, parser differential tests, and mutation tests. |

No verifier may return a promotion-grade result based only on metadata shape,
receipt presence, transport locality, or a caller-provided digest. Any
verification, registry, clock, authorization, persistence, or revocation
uncertainty is `hold`.

## Smallest safe follow-on sequence

This ADR is the only deliverable in this lane. The reconciliation and
source-implementation authority record permit the bounded default-disabled
`integrated_local` source sequence below. Its readiness conditions are
in-lane implementation and acceptance gates, and a separate operator-authority
record remains mandatory for any live scope:

Approval of this ADR plus the reconciliation grants only the bounded
default-disabled `integrated_local` source-slice authority described above. It
grants no live, bounded-live, production, provider, worker, deployment,
credential, merge, or cleanup authority. This documentation lane implements no
verifier, issuer, or runtime behavior; any future source implementation must
remain fail-closed until every readiness gate passes.

1. **Complete authority worksheet.** Resolve every required implementation
   field, threat-model disposition, named owner, and separate live-authority
   boundary. No provider, worker, or live command.
2. **Default-disabled source records (future lane).** Implement
   additive/versioned contracts and durable records for approved trust-root/
   issuer metadata, server-owned run authorization, signed-receipt
   verification, exact bindings, and replay fencing. Prove the readiness gates
   before any acceptance or enablement; keep capability disabled by default and
   do not remove `live_evidence_unavailable`. This ADR lane does not implement
   those records, the verifier, the issuer, or runtime behavior.
3. **Adversarial tests and security review.** Exercise every matrix row,
   migration behavior, concurrency/restart replay, key lifecycle, clock
   policy, canonical vectors, and production-boundary separation. Require
   independent security review before enabling any acceptance path.
4. **Dry-run only.** Validate the verifier, registry, and authorization records
   against metadata-only fixtures with all provider, worker, mutation, and
   live-operation capabilities disabled. `integrated_local` remains the only
   accepted evidence level until server cryptographic verification exists and
   a separate live authority packet is approved.

The explicit preservation rule is: do not remove or weaken
`live_evidence_unavailable` until the supervisor has cryptographically
verified the exact receipt, resolved the approved issuer/key registry,
validated the server-owned run authorization, enforced durable replay
protection, and recorded the result in supervisor-owned state.

## Approval and supersession

Required approvals are separate and named: architecture approves topology and
ownership; security approves the threat model, cryptographic and key lifecycle
controls; operator authority approves any later bounded-live scope. None may be
inferred from this decision, from the ignored hold artifact, or from existing
provider/worker approvals for other stories.

Only a later reviewed source-owned ADR may supersede this decision. It must
identify the selected topology, changed fields, migration impact, effective
authority boundary, and links to the named architecture, security, and
operator-authority records explicitly.
