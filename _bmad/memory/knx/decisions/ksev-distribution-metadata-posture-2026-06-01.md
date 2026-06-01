# KSEV Distribution Metadata Posture

Last updated: 2026-06-01

## Decision Status

Status: accepted

Decision: keep `ksev` marketplace manifest values local-only until public/private repository target, owner, license, homepage, release channel, and publication mechanism are explicitly approved.

## Short Summary

Do not replace `.agents/skills/.claude-plugin/marketplace.json` with provisional public metadata yet. Keep distribution-readiness requirements in KNX decision records.

## Why This Was Gated

Manifest metadata can imply public ownership, license rights, repository authority, support expectations, and publication readiness. Changing those fields before the repository and license decisions are approved would create ambiguity.

## Current Manifest Values

Keep:

- owner: `KendallAI vNext local`
- author: `KendallAI vNext local`
- license: `UNLICENSED`
- homepage: `local-only`
- repository: `local-only`

## Future Metadata Change Requirements

Before changing manifest metadata away from local-only, record:

- approved public or private owner,
- approved author/organization,
- license decision,
- homepage URL or documentation target,
- repository URL or private repository placeholder policy,
- release channel,
- publication mechanism,
- safety review result,
- explicit user approval.

## Boundaries

This decision does not approve:

- public release,
- GitHub/remotes,
- repository creation,
- push or pull,
- PRs/issues/actions/releases/packages,
- external publishing,
- credential or authentication workflows,
- external sends/providers,
- source mutation,
- source inventory generation inside `ksev`,
- local model/GPU processing,
- customer/production access,
- runtime assistant behavior.

## Next Gate

Resolved next gate: company commercial license posture.

Decision record: `company-commercial-license-posture-2026-06-01.md`

Decision: preserve the option to sell or negotiate a private commercial license for KNX or `ksev` to the user's company. Keep the current manifest `UNLICENSED`, do not activate a public license, and require a separate legal-reviewed permission path before company sharing or adoption.

Next gate: company evaluation access protocol.

Summary: define whether and how KNX could be shown to the company for evaluation without granting production-use, redistribution, source ownership, or public-license rights.

Why gated: even evaluation can create IP, confidentiality, employment, data-egress, and implied-license risk if artifacts are shared before scope and permissions are explicit.

Recommendation: approve a planning-only evaluation protocol next. Do not share artifacts, configure remote access, or grant company use until the protocol is accepted and the exact artifact set is reviewed.

## Decision Sources

- `.agents/skills/.claude-plugin/marketplace.json`
- `_bmad/memory/knx/decisions/ksev-private-repo-distribution-plan-2026-06-01.md`
- `_bmad/memory/knx/decisions/validator-distribution-2026-06-01.md`
- User approval on 2026-06-01.
