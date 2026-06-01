# KNX Fast Lane Local Governance Profile

Last updated: 2026-06-01

## Decision Status

Status: accepted

Decision: allow KNX workflows to proceed without per-step user interaction for low-risk local governance, evidence, validation, runtime packet, and local commit work when all fast-lane conditions are satisfied. This profile is extended by `default-proceed-local-workflow-2026-06-01.md`, which makes proceed-unless-hard-gated the primary operating rule for eligible local KNX work.

## Short Summary

The user approved a faster workflow mode for local-only KNX work. The assistant may continue through recommended local governance and evidence steps without asking for each micro-approval, but must stop at hard gates.

## Why This Was Gated

This changes the interaction model. It reduces approval prompts, so the allowed scope and hard stops must be durable and explicit.

## Fast-Lane Allowed Work

Allowed without additional interaction when all boundary checks pass:

- KNX decision records under `_bmad/memory/knx/decisions/`.
- KNX daily/index updates.
- KNX safety-review updates.
- Local runtime evidence under `_bmad/memory/knx/runtime/`.
- Synthetic fixture and validation evidence updates inside existing approved KNX locations.
- Local evaluation packet and discussion-guide drafting or hardening under approved runtime storage.
- Artifact inventories, work traces, validation evidence, and source/evidence contract records.
- Deterministic local checks such as JSON parse, `git diff --check`, `rg` scans, local validator runs, and BMad module validation.
- Local Git staging and local commits for scoped KNX governance, evidence, validator, and runtime packet records.
- Follow-up pointer sync commits when needed for KNX memory consistency.

## Fast-Lane Conditions

Every fast-lane action must satisfy all of these:

- no external sends,
- no company sharing,
- no public distribution,
- no license grant or rights grant,
- no GitHub/remotes/push/pull/PR/issue/action/release/package workflow,
- no customer or production access,
- no credential, MFA, token, or account/security workflow,
- no source mutation outside scoped KNX governance/evidence records,
- no writes outside approved KNX memory/runtime locations unless a separate hard gate approves them,
- no local model/GPU processing,
- no runtime assistant behavior,
- no destructive action,
- local validation is run when material artifacts are created or changed,
- local commits are scoped and non-remote.

## Hard Gates That Still Require User Approval

The assistant must stop and present a gate before:

- IDE or workspace configuration writes such as editor-specific task/button files,
- any write outside `_bmad/memory/knx/**` or the approved KNX runtime storage,
- source mutation beyond scoped KNX governance/evidence records,
- external sends,
- company sharing,
- GitHub/remotes or any remote operation,
- public distribution or package publication,
- repository visibility changes,
- license activation or rights grant,
- commercial terms, pricing, support, warranty, SLA, or legal agreement drafting intended for external use,
- customer/production access,
- credential/account-security workflows,
- local model/GPU processing,
- destructive or ambiguous data-loss actions,
- risk score `9` waiver.

## Interaction Rule

For fast-lane-eligible work, the assistant should:

1. State briefly that the work is proceeding under the fast-lane profile.
2. Execute the recommended local steps.
3. Validate locally.
4. Commit locally when appropriate.
5. Continue to the next fast-lane-eligible recommendation.
6. Stop only when a hard gate is reached or the user asks to pause.

Default-proceed decision: `default-proceed-local-workflow-2026-06-01.md`.

For hard gates, the assistant must present:

- short summary,
- why gated,
- exact target paths/actions,
- exclusions,
- validation plan,
- rollback plan when relevant,
- whether local commit is included.

## Relationship To Existing Gate Flow

This profile narrows the earlier approval gate flow for local-only KNX governance/evidence work. The default-proceed decision strengthens this profile for eligible local work. The older gate format still applies to hard gates. This profile does not approve any hard-gated class.

## Next Hard Gate

Resolved follow-up: IDE one-click action declined.

Decision: do not create an IDE button or IDE/workspace configuration for this packet.

Resolved follow-up: company-facing discussion parked.

Decision record: `company-facing-discussion-parked-2026-06-01.md`

Decision: do not continue toward sharing-readiness, external discussion, company evaluation, or external send planning unless the user explicitly reopens that path later.

Next recommended local workflow: KNX local backlog consolidation.

## Decision Sources

- User approval on 2026-06-01.
- `_bmad/memory/knx/decisions/approval-gate-flow-2026-06-01.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/decisions/local-git-commit-2026-06-01.md`
