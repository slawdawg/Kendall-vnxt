# KSEV Private-Repo Distribution Plan

Last updated: 2026-06-01

## Decision Status

Status: accepted for planning

Decision: prepare `ksev` for future public distribution while keeping the repository private and performing no GitHub, remote, push, publication, or external-send workflow now.

## Short Summary

Set up `ksev` on the right distribution footing without taking on public-release risk yet.

The current state remains:

- local installable optional module,
- private/local repository posture,
- no remote configured or used,
- no publication,
- no public license grant yet.

## Why This Is Gated

Public distribution planning touches ownership, licensing, repository identity, public metadata, release channels, and future publication mechanics. Those choices can create legal, security, and data-egress implications. Planning is allowed locally; actual GitHub/remotes, publication, and public repo changes remain separately gated.

## Current Manifest Posture

Manifest: `.agents/skills/.claude-plugin/marketplace.json`

Current values remain intentionally local-only:

- owner: `KendallAI vNext local`
- author: `KendallAI vNext local`
- license: `UNLICENSED`
- homepage: `local-only`
- repository: `local-only`

These values should not be replaced with public URLs until the private repository, owner, license, and publication path are explicitly approved.

## Distribution-Ready Metadata To Decide Later

Before public distribution, decide:

- public owner name,
- public author name,
- license,
- homepage URL,
- repository URL,
- release channel,
- versioning policy,
- publication mechanism,
- support/contact route,
- security reporting route.

## Recommended Future Metadata Shape

When public distribution is approved, use:

- `name`: `ksev`
- `owner.name`: approved public owner
- `license`: approved SPDX license identifier or `UNLICENSED` if private-only
- `homepage`: approved public documentation URL
- `repository`: approved private or public repository URL
- plugin `version`: semantic version, starting from `1.0.0` unless a pre-release path is chosen
- plugin `author.name`: approved public author or organization
- keywords: include `bmad`, `knx`, `kendallai`, `source-evidence`, `validator`

## Private Repository Posture

Allowed now:

- local planning,
- local validation,
- local commits,
- drafting metadata requirements,
- drafting release checklist.

Blocked until separate approval:

- creating a remote,
- pushing to GitHub,
- configuring repository visibility,
- using GitHub issues, PRs, actions, releases, or packages,
- publishing to a marketplace or registry,
- adding credentials or authentication workflows,
- linking to a repository as authoritative public metadata.

## Release Checklist Before Publication

Before public release:

1. Confirm owner, author, license, homepage, repository, release channel, and publication mechanism.
2. Confirm repo visibility target: private-held, private beta, or public.
3. Run packaged unit tests.
4. Run packaged validator on synthetic fixtures.
5. Run BMad module validation.
6. Run targeted secret-pattern scan.
7. Verify manifest JSON.
8. Verify no source inventory generation, source mutation, GitHub/remotes, external providers, local model/GPU, customer/production, credential, account/security, or runtime assistant behavior is included in `ksev`.
9. Run `knx-safety-validation-review` against the release candidate.
10. Record publication approval before any push or publish.

## Safety Boundaries

This decision does not approve:

- public release,
- GitHub/remotes,
- push or pull,
- PRs/issues/actions/releases/packages,
- external publishing,
- external sends/providers,
- source mutation,
- source inventory generation inside `ksev`,
- local model/GPU processing,
- customer/production access,
- credentials or account/security workflows,
- runtime assistant behavior.

## Next Gate

Resolved next gate: company commercial license posture.

Decision record: `company-commercial-license-posture-2026-06-01.md`

Decision: preserve the option to sell or negotiate a private commercial license for KNX or `ksev` to the user's company. Keep the current manifest `UNLICENSED`, do not activate a public license, and require a separate legal-reviewed permission path before company sharing or adoption.

Next gate: company evaluation access protocol.

Summary: define whether and how KNX could be shown to the company for evaluation without granting production-use, redistribution, source ownership, or public-license rights.

Why gated: even evaluation can create IP, confidentiality, employment, data-egress, and implied-license risk if artifacts are shared before scope and permissions are explicit.

Recommendation: approve a planning-only evaluation protocol next. Do not share artifacts, configure remote access, or grant company use until the protocol is accepted and the exact artifact set is reviewed.

## Distribution Metadata Posture

Decision record: `ksev-distribution-metadata-posture-2026-06-01.md`

Decision: keep manifest values local-only until repository target, owner, license, homepage, release channel, and publication mechanism are explicitly approved.

## Company Commercial License Posture

Decision record: `company-commercial-license-posture-2026-06-01.md`

Decision: preserve private commercial licensing optionality for future company adoption. Current artifacts remain private/local and `UNLICENSED`; no public license, company sharing, or adoption rights are granted by this plan.

## Decision Sources

- `_bmad/memory/knx/decisions/validator-distribution-2026-06-01.md`
- `.agents/skills/.claude-plugin/marketplace.json`
- User approval on 2026-06-01.
