# Validator Distribution Decision - KNX Source Evidence Validator

Last updated: 2026-06-01

## Decision Status

Status: accepted

Decision: keep `ksev` as local installable packaging evidence for now.

The KNX Source Evidence Validator is scaffolded, structurally validated, and safety-reviewed as a standalone optional module. It is not approved for public distribution.

## Scope

In scope:

- Local standalone optional module packaging.
- Synthetic source/evidence fixture validation.
- Local report writing under approved KNX runtime storage.
- Local module validation evidence.

Out of scope:

- Public release or marketplace publication.
- GitHub/remotes or external publishing.
- Source inventory generation.
- Operational source intake.
- Source mutation.
- External providers.
- Local model/GPU processing.
- Customer/production access.
- Credentials, account/security workflows, or runtime assistant behavior.
- Changes to the KNX governance core module.

## Distribution Metadata

Manifest: `.agents/skills/.claude-plugin/marketplace.json`

Recorded local-only metadata:

- owner: `KendallAI vNext local`
- author: `KendallAI vNext local`
- license: `UNLICENSED`
- homepage: `local-only`
- repository: `local-only`

These values intentionally avoid implying a public owner, public repository, public homepage, or reusable license grant.

## Verification

- Marketplace JSON parse: pass.
- Packaged unit tests: 10 passed.
- Packaged validator result: PASS, 14 fixtures, 0 errors, 0 warnings.
- BMad module validation: pass, 0 findings.
- `git diff --check`: pass.
- Targeted secret-pattern scan: no key material found; matches were policy mentions and validator detection-pattern source.

## Release Readiness

Local use readiness: accepted.

Public distribution readiness: deferred.

Public distribution requires a later explicit decision that names:

- public owner,
- license,
- homepage,
- repository,
- release channel,
- safety review target,
- publication mechanism.

## Recommended Next Workflow

Recommended next workflow: pause validator packaging expansion and route future work by concrete capability.

Safe next options:

- `knx-source-evidence-contract` if a consuming workflow needs additional fixture or evidence fields.
- `knx-mature-tool-review` before any source inventory materialization workflow.
- `knx-safety-validation-review` before any new optional pack, public release path, external send, source mutation, or operational source intake.

## Decision Sources

- `_bmad/memory/knx/decisions/module-strategy-2026-05-31.md`
- `_bmad/memory/knx/decisions/safety-review-2026-06-01.md`
- `_bmad/memory/knx/decisions/validator-implementation-target-2026-06-01.md`
- `skills/reports/module-validation-ksev-2026-06-01.md`
