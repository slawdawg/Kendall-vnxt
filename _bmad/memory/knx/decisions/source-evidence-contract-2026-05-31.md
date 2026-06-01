# Source Evidence Contract Decision

Last updated: 2026-05-31

## Decision Status

Status: accepted

Decision type: source-evidence-contract

Decision: accept a provisional Markdown source/evidence contract defining source packets, work traces, validation evidence, user-input-required items, decision records, fixture packs, and output metadata.

## Rationale

The governance foundation needs traceable artifacts before operational workflows are built. A Markdown contract fits the current mature-tool decision and stays inside the approved setup memory boundary.

## Scope

Applies to KNX planning and governance artifacts under `_bmad/memory/knx`. It does not approve real source intake, live runtime storage, external provider sends, credentials, customer data, production data, or source mutation.

## Major Schema Choices

- Use explicit artifact IDs for source packets, work traces, validation evidence, user-input-required items, decisions, fixture packs, and outputs.
- Require source support and uncertainty fields on source packets and outputs.
- Require output links to source packets, work traces, and validation evidence.
- Use validation results `PASS`, `CONCERNS`, `FAIL`, and `WAIVED`.
- Use risk scores 0 through 9, with score `9` blocking unless explicitly waived.
- Keep fixtures synthetic-only under `_bmad/memory/knx/fixtures/synthetic`.

## Approval Basis

Approval basis: tool-review-derived, execution-policy-derived, data-boundary-derived, and defaulted from KNX source/evidence workflow.

## Risk Score

Risk score: 3

Reason: the contract is local and does not ingest real data, but downstream use depends on unresolved storage and source boundaries.

## Review Condition

Review after storage root and allowed source roots are approved, or before any operational workflow creates real source packets.

## Source References

- `_bmad/memory/knx/profile.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/tool-evaluation.md`
- `_bmad/memory/knx/source-evidence-contract.md`

## Open Questions

- Who can approve risk score `9` waivers?
- What ID convention should downstream workflows use?
- Which workflow consumes this contract first?

## Decision Sources

- Decision status: local governance review.
- Schema choices: defaulted from KNX workflow and adapted to current data boundaries.
- Risk score: local review.
