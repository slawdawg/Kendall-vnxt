# KNX Company Commercial License Posture

Last updated: 2026-06-01

## Decision Status

Status: accepted for planning

Decision: preserve the option to sell or negotiate a private commercial license for KNX or `ksev` to the user's company. Keep current artifacts private/local and `UNLICENSED` until a later legal-reviewed license or evaluation agreement is explicitly approved.

## Short Summary

KNX and `ksev` should not be placed under Apache-2.0, MIT, or another public open-source license merely because future company adoption is possible. The current posture is commercial-option-preserving:

- private/local repository posture,
- manifest remains `UNLICENSED`,
- no public license grant,
- no company distribution,
- no GitHub/remote/publication workflow,
- future company use requires a separate legal-reviewed permission path.

## Why This Was Gated

This decision affects ownership, employer IP risk, commercial leverage, redistribution rights, public licensing strategy, and whether a company receives evaluation-only access or paid production-use rights. Those rights should not be inferred from packaging readiness or module metadata.

## Current License Posture

Current posture:

- `.agents/skills/.claude-plugin/marketplace.json` keeps `license: UNLICENSED`.
- No repository license file is added by this decision.
- No Apache-2.0, MIT, GPL, or other public license is activated.
- Public open-source release remains deferred.
- Company adoption remains unapproved until a later agreement is recorded.

## Commercial Option

Future company-facing paths may include:

- evaluation-only permission,
- paid internal-use license,
- paid production-use license,
- support or warranty terms,
- source-available private license,
- later open-source release as a separate decision.

The preferred near-term posture is evaluation-only until ownership, employment/IP, redistribution, confidentiality, support, warranty, and payment terms are reviewed.

## Boundaries

This decision does not approve:

- sending code, docs, archives, or evidence to the company,
- use of company systems, customer systems, or production systems,
- GitHub/remotes,
- repository creation or visibility changes,
- pushes, pulls, PRs, issues, actions, releases, or packages,
- public publication,
- credential or account/security workflows,
- external providers or external sends,
- source mutation,
- local model/GPU processing,
- runtime assistant behavior,
- legal advice or a binding license agreement.

## Requirements Before Company Sharing Or Adoption

Before any company sharing, evaluation, or adoption:

1. Identify the exact artifact scope.
2. Decide whether access is evaluation-only, internal-use, production-use, or support/warranty related.
3. Review employment/IP assignment and conflict-of-interest constraints.
4. Define confidentiality and redistribution restrictions.
5. Define support, warranty, liability, and payment terms.
6. Record explicit approval for any send, repository access, demo, archive, or package.
7. Run a safety review against the exact candidate artifact set.

## Next Gate

Resolved next gate: company evaluation access protocol.

Decision record: `company-evaluation-access-protocol-2026-06-01.md`

Decision: define a planning-only protocol for possible future company evaluation. No code, documentation bundle, archive, repository access, demo environment, or license rights are shared or granted by this decision.

Next gate: evaluation candidate packet scope.

Summary: choose the first local-only candidate packet for possible future company evaluation, preferably documentation-only or controlled walkthrough materials, and define exactly what files or summaries would be eligible for review.

Why gated: the candidate packet determines what could later leave the local repo, what rights language is needed, and what safety/security checks must run before any company-facing step.

Recommendation: start with documentation-only scope. Exclude source archives, repository access, runtime inventories, credentials, customer/production data, source mutation workflows, GitHub/remotes, public distribution, and any operational deployment materials.

## Decision Sources

- User approval on 2026-06-01.
- `_bmad/memory/knx/decisions/ksev-distribution-metadata-posture-2026-06-01.md`
- `_bmad/memory/knx/decisions/ksev-private-repo-distribution-plan-2026-06-01.md`
- `.agents/skills/.claude-plugin/marketplace.json`
