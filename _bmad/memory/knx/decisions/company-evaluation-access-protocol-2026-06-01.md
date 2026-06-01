# KNX Company Evaluation Access Protocol

Last updated: 2026-06-01

## Decision Status

Status: accepted for planning

Decision: define a planning-only protocol for possible future company evaluation of KNX or `ksev`. No code, documentation bundle, archive, repository access, demo environment, or license rights are shared or granted by this decision.

## Short Summary

Future company evaluation should start with a controlled evaluation protocol, not an informal code share. The protocol preserves the private commercial license path while preventing accidental production-use, redistribution, source ownership, or public-license rights.

Allowed now:

- local planning,
- local decision records,
- local candidate artifact scoping,
- local risk and safety review planning,
- local commit of governance records.

Blocked until later explicit approval:

- sending files or archives to the company,
- granting repository access,
- configuring GitHub/remotes,
- running demos on company systems,
- using customer or production systems,
- granting production-use, redistribution, sublicensing, or ownership rights,
- signing or executing a license agreement.

## Why This Was Gated

Even evaluation can create IP, confidentiality, employment, data-egress, implied-license, and commercial-positioning risk. Evaluation access must therefore define scope, restrictions, approval points, and evidence before anything is shared.

## Evaluation Protocol

Before any company-facing evaluation is allowed, create an evaluation candidate packet with:

1. Exact artifact list.
2. Purpose of evaluation.
3. Intended audience or role class.
4. Access mode: read-only review, live demo, binary/package review, source review, or documentation-only review.
5. Explicit restrictions: no production use, no redistribution, no sublicensing, no reverse transfer of ownership, and no public-license grant.
6. Confidentiality posture.
7. Employment/IP and conflict-of-interest review checkpoint.
8. Security and secret-scan evidence.
9. Safety review against the exact candidate packet.
10. Explicit user approval before any external send, repository access, or demo.

## Preferred First Evaluation Shape

Preferred first company-facing shape, if later approved:

- documentation-only or controlled walkthrough first,
- no repository access,
- no source archive,
- no customer/production data,
- no credentials,
- no company-system deployment,
- no remote automation,
- no public license activation.

This keeps evaluation focused on fit and value before exposing source or granting rights.

## Boundaries

This decision does not approve:

- company sharing,
- company use,
- company repository access,
- GitHub/remotes,
- push, pull, PR, issue, action, release, or package workflows,
- external publication,
- public distribution,
- public license activation,
- production-use rights,
- redistribution rights,
- ownership transfer,
- source mutation,
- external sends,
- local model/GPU processing,
- credentials or account/security workflows,
- customer/production access,
- runtime assistant behavior,
- legal advice or a binding license agreement.

## Required Evidence Before Any Sharing

Before sharing any evaluation material:

- candidate artifact inventory,
- artifact classification,
- targeted secret-pattern scan,
- confirmation that no customer/production/credential/account-security material is included,
- license and rights summary,
- safety review result,
- explicit user approval for the exact sharing mechanism.

## Next Gate

Resolved next gate: evaluation candidate packet scope.

Decision record: `evaluation-candidate-packet-scope-2026-06-01.md`

Decision: define the first possible company evaluation candidate packet as documentation-only and local-only. This decision does not approve sharing, exporting, sending, repository access, demos, license rights, or company use.

Next gate: local evaluation packet draft.

Summary: create a local-only draft evaluation packet from allowed summaries and restrictions, stored under approved KNX runtime storage, with no source code, no runtime inventory export, no company sharing, and no license grant.

Why gated: drafting creates a concrete artifact that could later be shared; it must stay local, be stored in an approved location, and be validated against the candidate scope before any company-facing gate.

Recommendation: approve local draft creation under `_bmad/memory/knx/runtime/evaluation-packet/`, then run safety review and targeted secret scan. Keep all external sharing blocked.

## Decision Sources

- User approval on 2026-06-01.
- `_bmad/memory/knx/decisions/company-commercial-license-posture-2026-06-01.md`
- `_bmad/memory/knx/decisions/ksev-private-repo-distribution-plan-2026-06-01.md`
- `_bmad/memory/knx/decisions/ksev-distribution-metadata-posture-2026-06-01.md`
