# KNX Evaluation Candidate Packet Scope

Last updated: 2026-06-01

## Decision Status

Status: accepted for planning

Decision: define the first possible company evaluation candidate packet as documentation-only and local-only. This decision does not approve sharing, exporting, sending, repository access, demos, license rights, or company use.

## Short Summary

The first candidate packet should let a company reviewer understand KNX value, governance posture, safety boundaries, and commercial licensing posture without receiving source code, runtime inventories, archives, or operational deployment material.

Preferred first packet shape:

- documentation-only,
- local-only until a later sharing gate,
- no source archive,
- no repository access,
- no runtime evidence export,
- no customer/production/credential material,
- no public license activation,
- no production-use or redistribution rights.

## Why This Was Gated

The candidate packet determines what could later leave the local repo, what rights language is needed, and what safety/security checks must run before any company-facing step. Poor scoping could accidentally expose source, runtime evidence, credentials, customer/production material, or imply evaluation or production-use rights.

## Candidate Packet Purpose

Purpose: support a future company evaluation conversation by explaining:

- what KNX is,
- what problem it solves,
- what governance safeguards exist,
- what is currently usable,
- what remains provisional,
- what commercial-option-preserving posture is in place,
- what would be required before company adoption.

## Eligible Local-Only Materials

Eligible for local packet planning:

- short KNX overview,
- governance boundary summary,
- commercial license posture summary,
- evaluation restrictions summary,
- module validation summary,
- safety-review summary,
- high-level architecture or workflow summary,
- controlled walkthrough outline,
- redacted screenshots or diagrams created specifically for evaluation, if later approved.

Eligible source records for summarization only:

- `_bmad/memory/knx/profile.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/source-evidence-contract.md`
- `_bmad/memory/knx/decisions/company-commercial-license-posture-2026-06-01.md`
- `_bmad/memory/knx/decisions/company-evaluation-access-protocol-2026-06-01.md`
- `skills/reports/module-validation-knx-2026-06-01.md`
- `skills/reports/module-validation-ksev-2026-06-01.md`

These records may be used to draft local summaries. They are not approved for direct sharing by this decision.

## Excluded Materials

Exclude from the first candidate packet:

- source code,
- repository access,
- Git history,
- GitHub/remotes,
- source archives,
- runtime evidence inventories,
- `_bmad/memory/knx/runtime/**` exports,
- source inventory evidence exports,
- customer data,
- production data,
- credentials, tokens, MFA, account/security material,
- external-provider configuration,
- local model/GPU outputs,
- source mutation workflows,
- operational deployment materials,
- runtime assistant behavior,
- public distribution metadata,
- public license files,
- support, warranty, pricing, or contract terms beyond a high-level statement that commercial terms are separate.

## Required Checks Before Any Later Sharing Gate

Before any sharing request for this packet:

1. Materialize a local draft packet under approved KNX runtime storage or another explicitly approved local planning path.
2. Produce an artifact inventory.
3. Classify each artifact as summary, diagram, validation summary, or restriction notice.
4. Run targeted secret-pattern scan.
5. Confirm no source code, runtime inventory, customer/production data, credential/account-security material, GitHub/remote details, or operational deployment material is included.
6. Run safety review against the exact draft packet.
7. Present the exact sharing mechanism and audience for explicit approval.

## Boundaries

This decision does not approve:

- writing outside approved storage,
- source mutation,
- direct source sharing,
- company sharing,
- external sends,
- repository access,
- GitHub/remotes,
- public distribution,
- license activation,
- production-use rights,
- redistribution rights,
- ownership transfer,
- customer/production access,
- credential or account/security workflows,
- local model/GPU processing,
- runtime assistant behavior,
- legal advice or a binding agreement.

## Next Gate

Resolved next gate: local evaluation packet draft.

Draft artifacts:

- `_bmad/memory/knx/runtime/evaluation-packet/evaluation-packet-2026-06-01.md`
- `_bmad/memory/knx/runtime/evaluation-packet/restrictions-2026-06-01.md`
- `_bmad/memory/knx/runtime/evaluation-packet/artifact-inventory-2026-06-01.json`
- `_bmad/memory/knx/runtime/evaluation-packet/work-trace-evaluation-packet-2026-06-01.md`
- `_bmad/memory/knx/runtime/evaluation-packet/validation-evaluation-packet-2026-06-01.json`

Decision: local draft materialized under approved KNX runtime storage. It remains local-only and is not approved for sharing, exporting, repository access, company use, or license grant.

Next gate: evaluation packet hardening review.

Summary: review the local draft for clarity, redaction needs, rights language, safety boundaries, and whether it should remain internal planning-only or advance toward a later sharing-readiness gate.

Why gated: the draft now exists as concrete material. Before any company-facing sharing can even be considered, it needs review for sensitive strategy, implied rights, confidentiality, employment/IP concerns, and excluded material.

Recommendation: keep sharing blocked and run a hardening pass that improves the packet while staying local-only.

## Decision Sources

- User approval on 2026-06-01.
- `_bmad/memory/knx/decisions/company-evaluation-access-protocol-2026-06-01.md`
- `_bmad/memory/knx/decisions/company-commercial-license-posture-2026-06-01.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/execution-policy.md`
