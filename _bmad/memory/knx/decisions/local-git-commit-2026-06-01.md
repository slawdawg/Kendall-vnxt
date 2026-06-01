# Local Git Commit Decision - KNX Governance Work

Last updated: 2026-06-01

## Decision Status

Status: accepted

Decision: allow local Git staging and local commits for scoped KNX governance and validator work.

## Approval Basis

User approved local staging and local commits as low risk.

Approved statement:

```text
I think staging files and local commits are low risk and should be allowed
```

## Scope

Allowed:

- Stage scoped KNX governance records.
- Stage scoped synthetic fixture records.
- Stage the optional local-only `ksev` validator pack.
- Stage local KNX runtime validation evidence, handoffs, and commit-readiness reports under approved runtime storage.
- Create a local Git commit after staged checks pass.

Not allowed by this decision:

- Git push.
- GitHub/remotes.
- Public release or marketplace publication.
- External sends or providers.
- Source mutation as an operational workflow.
- Source inventory generation as an operational pack.
- Local model/GPU processing.
- Customer/production access.
- Credentials or account/security workflows.
- Writes outside the repository except ordinary local Git metadata required for staging/commit.

## Required Local Checks

Before local commit, run:

- `git diff --cached --check`
- KNX governance-core module validation.
- Optional `ksev` module validation.
- Packaged `ksev` tests.
- Synthetic fixture validation.
- Targeted secret-pattern scan over the staged KNX scope.

## Decision Sources

- `_bmad/memory/knx/decisions/mature-tool-commit-readiness-2026-06-01.md`
- `_bmad/memory/knx/runtime/commit-readiness/reports/staging-plan-2026-06-01.md`
- User approval in conversation on 2026-06-01.
