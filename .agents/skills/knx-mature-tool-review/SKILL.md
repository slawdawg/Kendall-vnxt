---
name: knx-mature-tool-review
description: Reviews mature tools before custom code. Use when the user says "review mature tools", "check before custom code", or "create custom-code decision record".
---

# knx-mature-tool-review

## Overview

This workflow checks mature workflows, platform capabilities, maintained packages, and existing tools before KendallAI vNext recommends custom code. Act as a pragmatic technology evaluator with a custom-code-last bias. Produces comparison reports and decision records that downstream `knx` workflows can use.

## On Activation

Load available config from `{project-root}/_bmad/config.yaml` and `{project-root}/_bmad/config.user.yaml` (root level and `knx` section). Use sensible defaults for anything not configured.

Read `{project-root}/_bmad/memory/knx/profile.md`, `{project-root}/_bmad/memory/knx/execution-policy.md`, `{project-root}/_bmad/memory/knx/data-boundaries.md`, and `{project-root}/_bmad/memory/knx/tool-evaluation.md` if present. If profile and execution policy are both missing, route to `knx-profile-setup` or `knx-execution-policy` before making recommendations.

If a prior review exists for the same capability or decision, read it before changing conclusions. Surface conflicts between prior decisions and the new request.

## Inputs

Use:

- Proposed capability, workflow, module, or implementation decision.
- User outcome and constraints.
- Install profile and execution policy.
- Data-boundary plan and allowed processing/storage destinations.
- Known mature tools, platform capabilities, or maintained packages.
- User-provided candidates, links, docs, or examples.

If current tool/package evidence is needed and not available locally, search or browse only enough to compare options. Prefer official docs, package registries, repository metadata, release notes, and maintained project sources over commentary.

## Review Questions

Every review must answer:

- What job is the user trying to get done?
- Which mature tools, platform capabilities, maintained packages, or workflows might already solve it?
- Which options fit the install profile, data boundaries, local-first policy, and external-provider policy?
- Which options introduce security, privacy, cost, maintenance, dependency, licensing, or platform risk?
- What custom code, if any, remains after mature options are considered?
- What is the smallest custom-code role that would still solve the gap?
- What rollback or exit path exists if the chosen option fails?

## Outputs

Create or update:

- `{project-root}/_bmad/memory/knx/tool-evaluation.md`
- `{project-root}/_bmad/memory/knx/decisions/custom-code-YYYY-MM-DD.md` when custom code is accepted, rejected, or deferred for a reviewed capability.
- `{project-root}/_bmad/memory/knx/decisions/mature-tool-YYYY-MM-DD.md` when a mature tool or platform choice is accepted.
- `{project-root}/_bmad/memory/knx/daily/YYYY-MM-DD.md`

If memory folders are absent, create only the minimal needed folders. Do not create live runtime/deployment state.

## Report Contract

The comparison report or decision record must include:

- Decision status: `accepted`, `rejected`, `deferred`, `blocked`, or `needs-research`.
- Capability or workflow reviewed.
- Research questions.
- Options considered.
- Fit against execution policy.
- Fit against data-boundary plan.
- Cost posture.
- Security/privacy posture.
- Maintenance and dependency posture.
- Licensing or usage constraints if known.
- Recommendation.
- Custom-code scope if any.
- Rollback or exit path.
- Evidence links or local source references.
- Assumptions and open questions.
- Last updated date and source of each key claim.

## Workflow

1. Clarify the capability and decision being reviewed before researching.
2. Check profile, execution policy, data boundaries, and prior tool evaluations.
3. Define research questions narrow enough to compare options.
4. Identify mature workflows, platform features, maintained packages, and local deterministic options.
5. Compare candidates against policy, boundaries, cost, security/privacy, maintenance, licensing, installability, and rollback.
6. Recommend mature tool, mature workflow, custom glue, custom code deferment, or further research.
7. Create a decision record whenever custom code or a tool choice is accepted, rejected, or deferred.
8. Append a daily log note with reviewed capability, recommendation, evidence level, and next workflow.
9. Recommend `knx-source-evidence-contract` after the first governance tool review is complete.

## Safety Rules

- Do not install, update, remove, or execute candidate tools during review.
- Do not create accounts, approve billing, change settings, handle credentials, or accept licenses.
- Do not send source data to external services.
- Do not recommend custom code until mature options and deterministic local options are considered.
- Do not recommend external LLM/GPT providers unless the execution policy allows them and prior layers are insufficient.
- Do not treat popularity as sufficient maturity; consider maintenance, documentation, licensing, Windows support, dependency risk, and fit.
- If evidence is stale or uncertain, mark the decision `needs-research` or `deferred` rather than pretending certainty.

## Next Workflow

If the mature-tool review supports the governance foundation, recommend `knx-source-evidence-contract`. If the review finds missing profile, execution-policy, or data-boundary decisions, route back to the specific missing governance workflow.
