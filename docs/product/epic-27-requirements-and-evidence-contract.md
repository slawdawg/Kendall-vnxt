# Epic 27 requirements and evidence contract

Status: accepted recovery decision; revision `2026-07-28.1`

This contract follows the repository's
[product requirements boundary](../workflows/product-requirements-boundary.md)
and records the recovery decision following the
[Epic 27 source reconciliation](../workflows/epic-27-source-reconciliation-2026-07-28.md).

## Authority and scope

This current source-owned recovery decision accepts exactly two Epic 27 slices
from historical PR #687. It does not reconstruct a broader historical Epic,
grant runtime authority, or claim integration, live-provider, deployment, or
production readiness. This document is the single revision-bound tracker for
these two accepted criteria; no parallel tracker is created.

## Accepted criteria and evidence

| Criterion | Measurable requirement | Source/test evidence | Delivery evidence | Status |
| --- | --- | --- | --- | --- |
| E27-1 | POST work-packet mutation routes return authoritative response envelopes with contract-only typing; mutation and authority behavior remain unchanged. | Source: `services/supervisor/src/supervisor/api/main.py`. Test: `services/supervisor/tests/test_authoritative_work_packet_mutation_envelope.py` asserts both typed POST envelopes and the shared TypeScript contract. | PR #687: head `365a18c86f88899e7a9871a22c15aea7d9acf76e`, merge `6cf3132224fd7c6f6e8eead4c49e06f48fdce922`, base `dev`. | bounded done |
| E27-2 | Read-only delivery and cleanup report routes provide strict envelope coverage without mutation. | Test: `services/supervisor/tests/test_delivery_cleanup_report_envelope_contract.py` asserts eight read-only delivery/cleanup routes use typed envelopes, forbid extra fields, and expose non-generic data contracts. | Same exact merged PR #687 head and merge. | bounded done |

## Completion evidence rules

For a criterion to remain `bounded done`, all of the following shared evidence
conditions must be recorded for its mapped PR:

- `E27-G1` — an exact merged head and merge commit on the stated base branch;
- `E27-G2` — a terminal CI/check disposition for that exact head (pass or an
  explicitly documented skip); and
- `E27-G3` — a review-thread audit with no unresolved applicable review
  obligation.

The reconciliation snapshot records PR #687 as satisfying those conditions:
the exact head and merge above, no review threads, and the focused test evidence.
Its terminal GitHub check disposition is `SUCCESS` for `changes`, `fast`,
`supervisor`, and `check`; `full`, `static_bundle`, `javascript`, `static`, and
`static_bundle_summary` are recorded `SKIPPED`. The snapshot is dated
2026-07-28 UTC; any later delivery decision must query mutable GitHub state
again. These conditions prove the bounded criteria only; they do not prove
broader integration, live execution, stakeholder acceptance, deployment, or
production readiness.

## Context only

- #718 is unrelated, open reconcile-CLI safety work; it is not a criterion.
- #723 is unrelated frozen/open authority work; it is not a criterion.
- #728, #729, and #730 are contextual recovery/delivery history only. They are
  not mapped to these criteria and their post-merge thread obligations cannot
  be used to expand this contract.

## Implementation decision

No implementation is required by this recovery contract: both accepted slices
have bounded merged delivery evidence. A new implementation lane requires a
new accepted criterion or a verified failure of the mapped evidence; neither is
created by this document.

## Revision and recovery

Future changes must amend this document with a new revision, criterion ID,
evidence row, and explicit scope decision. The local planning input is
`_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-28-epic27-source-authority/prd.md`;
it is ignored workspace material, planning input only, and never runtime truth.
Recovery is to inspect the referenced PR and this revision; do not infer
broader scope from historical titles or merge history.
