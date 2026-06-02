# Company Evaluation Planning Gate - KNX

Last updated: 2026-06-01

## Decision Status

Status: accepted for local planning only

Decision: reopen the company-facing evaluation path only for local planning. No sharing, external send, repository access, company access, license grant, or evaluation permission is approved.

## Approved Scope

Allowed:

- local company evaluation planning,
- local checklist and evidence packet,
- review of existing local evaluation packet hardening findings,
- local commits for governance/evidence artifacts.

Allowed output location:

- `_bmad/memory/knx/runtime/greenfield-implementation/company-evaluation/`

## Current Evaluation Posture

Existing local artifacts remain local-only and unshared:

- `_bmad/memory/knx/runtime/evaluation-packet/evaluation-packet-2026-06-01.md`
- `_bmad/memory/knx/runtime/evaluation-packet/restrictions-2026-06-01.md`
- `_bmad/memory/knx/runtime/evaluation-packet/hardening-review-2026-06-01.md`
- `_bmad/memory/knx/runtime/evaluation-packet/discussion-guide-2026-06-01.md`

## Required Before Any Sharing

Before any company-facing action, record:

- exact audience,
- sharing mechanism,
- final artifact list,
- legal review path,
- restriction notice,
- confidentiality posture,
- employment/IP review checkpoint,
- safety review result,
- targeted sensitive-pattern scan,
- explicit send or access approval.

## Exclusions

Not approved:

- company sharing,
- external send,
- repository access,
- source archive,
- source code sharing,
- runtime/source inventory export,
- license grant,
- production-use permission,
- redistribution rights,
- ownership transfer,
- pricing, support, warranty, SLA, or contract terms intended for external use,
- customer/production/credential/account-security material,
- GitHub/remotes,
- public distribution,
- runtime assistant behavior.

## Validation Plan

Run:

- JSON parse for planning evidence,
- `git diff --check`,
- targeted sensitive-pattern scan,
- boundary review against existing hardening findings.

## Safety Review

Safety status: pass with concerns.

Concerns:

- Existing local evaluation packet remains too governance-internal for direct company sharing.
- Any future company-facing material should be shorter, audience-specific, and legally reviewed.
- Commercial posture and rights language can imply commitments if phrased loosely.

Mitigations:

- Keep this gate local-only.
- Require a later explicit sharing gate before any send/access/demo.
- Reuse the existing hardening review as a blocker against direct sharing.

## Approval Basis

User approved Gate 6 on 2026-06-01.

## Relationship To Prior Decisions

This decision reopens `company-facing-discussion-parked-2026-06-01.md` only for local planning.

It does not approve company sharing or evaluation access.

## Decision Sources

- `_bmad/memory/knx/decisions/company-evaluation-access-protocol-2026-06-01.md`
- `_bmad/memory/knx/decisions/company-facing-discussion-parked-2026-06-01.md`
- `_bmad/memory/knx/runtime/evaluation-packet/hardening-review-2026-06-01.md`
- User approval on 2026-06-01.
