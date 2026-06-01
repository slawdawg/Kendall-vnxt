# KNX Default-Proceed Local Workflow

Last updated: 2026-06-01

## Decision Status

Status: accepted

Decision: KNX workflows should proceed by default without user interaction whenever the next action is local-only, deterministic or mature-local-tool based, inside approved KNX memory/runtime boundaries, and not hard-gated.

## Short Summary

The operating model is now frictionless by default:

1. Choose the next safe local step.
2. Execute it.
3. Validate it.
4. Commit locally when scoped and appropriate.
5. Continue to the next safe local step.
6. Stop only when user input is genuinely required, a hard gate is reached, or the user asks to pause.

This supersedes per-step approvals for eligible local KNX governance, evidence, validation, packaging, and handoff work. It does not approve hard-gated actions.

## Why This Was Gated

This changes workflow autonomy. It reduces interaction overhead and allows local work to continue across recommended steps, so the stop conditions and excluded action classes must be explicit.

## Default-Proceed Scope

Proceed without asking when all conditions are true:

- The work is local-only.
- The work stays under `_bmad/memory/knx/**`, approved KNX runtime storage, or already-approved local KNX module/report paths.
- The work is scoped to KNX governance, evidence, validation, source/evidence contracts, module packaging evidence, local handoffs, local reports, synthetic fixtures, or local commits.
- The execution path uses mature local tools, deterministic processing, BMad/KNX workflows, local validators, or local Git.
- The work does not cross any hard gate.

Allowed examples:

- Create or update KNX decision records.
- Update KNX daily logs, index, backlog, handoff, safety review, source/evidence contract, data-boundary, execution-policy, mature-tool, or module-strategy records.
- Run local validation such as JSON parse, `git diff --check`, `rg` scans, BMad module validation, `ksev` unit tests, fixture validation, and source-packet-example validation.
- Refresh local validator reports under approved KNX runtime storage.
- Create local work traces, validation evidence, runtime evidence, artifact inventories, and metadata-only source packet examples inside approved KNX storage.
- Stage and commit scoped local KNX governance, evidence, validator, packaging, and runtime packet records.
- Continue through a sequence of default-proceed steps without asking for each micro-decision.

## Hard Gates That Still Require User Approval

Stop and ask before any of these:

- External sends or provider calls.
- Company sharing, company access, demos, evaluation access, or repository access.
- GitHub/remotes, pushes, pulls, PRs, issues, actions, releases, packages, or publication.
- Public distribution, package publication, repository visibility changes, public metadata activation, license activation, rights grants, or commercial terms intended for external use.
- Source mutation outside scoped KNX governance/evidence/module records.
- Writes outside approved KNX memory/runtime locations or already-approved local KNX module/report paths.
- IDE or workspace configuration writes.
- Customer, production, email/calendar, attachment, credential, MFA, token, secret, account/security, or administrative workflows.
- Local model/GPU/local accelerator processing.
- Runtime assistant behavior or live deployment behavior.
- Destructive or ambiguous data-loss actions.
- Risk score `9` waivers.

## Interaction Rule

For default-proceed work:

- Give a brief progress update when beginning a meaningful chain of work.
- Do not ask for approval for each safe local step.
- Validate material artifacts after creation or modification.
- Commit locally when the change is scoped, useful as a durable handoff, and local commit policy allows it.
- Continue to the next default-proceed action when it is clearly implied by the workflow.

For hard gates:

- Stop.
- Present the summary, why gated, exact target paths/actions, exclusions, validation plan, rollback plan when relevant, and whether local commit is included.
- Wait for explicit user approval.

For uncertainty:

- If the uncertainty is local and low-risk, record the assumption and proceed.
- If guessing could cross a hard gate, stop and ask.

## Relationship To Existing Decisions

This decision extends and strengthens `fast-lane-local-governance-2026-06-01.md`.

The older approval gate flow still applies only when a hard gate is reached.

This decision does not reopen parked paths:

- company-facing discussion,
- company sharing,
- public distribution,
- GitHub/remotes,
- IDE one-click action,
- operational source intake,
- runtime assistant behavior.

## Validation And Commit Expectations

Default validation set when relevant:

- `git diff --check`
- targeted sensitive-pattern scan for scoped files before local commit,
- JSON parse for changed JSON artifacts,
- BMad module validation for module packaging changes,
- `ksev` unit tests and validator runs for validator behavior or report changes.

Local commits are allowed when:

- the work is scoped to KNX governance/evidence/validator/module records,
- no hard gate was crossed,
- validation has passed or concerns are recorded,
- no remote operation is performed.

## Current Application

Applies immediately to the approved local-only greenfield implementation lane for:

- KNX governance core,
- standalone `ksev` validator,
- local validation and report refreshes,
- local routing, handoff, backlog, and decision records.

## Open Questions

No open questions block the default-proceed policy.

Future hard gates remain available if the user explicitly reopens a parked or blocked path.

## Decision Sources

- User approval on 2026-06-01.
- `_bmad/memory/knx/decisions/fast-lane-local-governance-2026-06-01.md`
- `_bmad/memory/knx/decisions/approval-gate-flow-2026-06-01.md`
- `_bmad/memory/knx/decisions/greenfield-implementation-lane-2026-06-01.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/source-evidence-contract.md`
