# KNX External Discussion Guide Scope

Last updated: 2026-06-01

## Decision Status

Status: accepted for planning

Decision: scope a short local-only external discussion guide derived from the hardened evaluation packet. This decision does not approve drafting a final external artifact, sharing, exporting, repository access, company use, evaluation permission, or license rights.

## Short Summary

The hardened internal packet should not be shared externally. If company-facing discussion is later considered, use a shorter local-only discussion guide as the safer next planning artifact.

The discussion guide scope is:

- one page or similarly short,
- local-only,
- summary-only,
- no source code,
- no repository access,
- no runtime inventory export,
- no operational deployment details,
- no pricing or contract terms,
- no license grant,
- no evaluation permission,
- no external send.

## Why This Was Gated

A discussion guide is closer to company-facing material than the internal packet. Its scope must prevent implied license rights, confidential disclosure, premature commercial commitments, or accidental approval for sharing.

## Allowed Guide Content

Allowed in the local-only guide:

- concise KNX purpose statement,
- high-level problem/value statement,
- current maturity statement,
- local validation summary,
- explicit "no rights granted" notice,
- explicit "discussion only, not an offer" notice,
- high-level next-step checklist for legal/evaluation review.

## Excluded Guide Content

Exclude:

- source code,
- source file paths beyond generic references,
- repository access instructions,
- Git history or commit details,
- runtime inventory exports,
- source inventory exports,
- customer data,
- production data,
- credentials, tokens, MFA, or account/security material,
- GitHub/remotes,
- external-provider configuration,
- local model/GPU outputs,
- source mutation workflows,
- operational deployment material,
- pricing, quote, support, warranty, SLA, or contract terms,
- license terms beyond "no rights granted; terms require separate written agreement."

## Required Checks Before Draft Acceptance

Before accepting a local discussion-guide draft:

1. Store it under `_bmad/memory/knx/runtime/evaluation-packet/`.
2. Confirm it is shorter and less governance-internal than the hardened packet.
3. Confirm no source code, runtime inventory export, customer/production data, credential/account-security material, GitHub/remote details, or operational deployment material is included.
4. Confirm no pricing, support, warranty, or production-use commitment is included.
5. Run targeted secret-pattern scan.
6. Run safety review.
7. Keep external sharing blocked.

## Boundaries

This decision does not approve:

- company sharing,
- external sends,
- repository access,
- GitHub/remotes,
- public distribution,
- public license activation,
- evaluation permission,
- production-use rights,
- redistribution rights,
- ownership transfer,
- pricing or contract terms,
- source mutation,
- customer/production access,
- credential or account/security workflows,
- local model/GPU processing,
- runtime assistant behavior,
- legal advice or a binding agreement.

## Next Gate

Resolved next gate: local discussion-guide draft.

Draft artifact:

- `_bmad/memory/knx/runtime/evaluation-packet/discussion-guide-2026-06-01.md`

Decision: a short local-only discussion guide draft is materialized. It is not approved for external sharing, repository access, company use, evaluation permission, license grant, or commercial terms.

Resolved follow-up: IDE one-click action declined.

Decision: do not create an IDE button or IDE/workspace configuration for this packet.

Resolved follow-up: company-facing discussion parked.

Decision record: `company-facing-discussion-parked-2026-06-01.md`

Decision: do not continue toward sharing-readiness, external discussion, company evaluation, or external send planning unless the user explicitly reopens that path later.

Next recommended local workflow: KNX local backlog consolidation.

## Decision Sources

- User approval on 2026-06-01.
- `_bmad/memory/knx/runtime/evaluation-packet/hardening-review-2026-06-01.md`
- `_bmad/memory/knx/runtime/evaluation-packet/evaluation-packet-2026-06-01.md`
- `_bmad/memory/knx/runtime/evaluation-packet/restrictions-2026-06-01.md`
- `_bmad/memory/knx/decisions/company-evaluation-access-protocol-2026-06-01.md`
