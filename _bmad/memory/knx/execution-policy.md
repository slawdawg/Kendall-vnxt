# KNX Execution Policy

Last updated: 2026-05-31

## Policy Status

Status: provisional

Reason: the base execution ladder is defined, storage root and read/planning source root are approved, GitHub/remote workflows are disabled by default, source mutation is blocked by default unless a later named workflow is explicitly approved, and local model/GPU processing is not assumed or approved by default.

## Effective Execution Ladder

Use the lowest safe layer that can satisfy the intended outcome:

1. Mature workflow, platform capability, or maintained tool already inside approved user/project boundaries.
2. Deterministic local processing: parsing, filtering, indexing, validation, extraction, formatting, fixtures, and repeatable transforms.
3. Local compute/model path using VM resources, host GPU, or local model runtime when availability and policy are confirmed.
4. Custom glue code for import/export, validation, orchestration, or last-mile automation after layers 1 and 2 are considered.
5. External LLM/GPT/provider use only when prior layers are insufficient and explicit approval or a recorded policy allows the specific send.

Source: defaulted from KNX execution-policy workflow and constrained by the current install profile.

## Mature-Tool-First Rule

Prefer mature, maintained tools and platform capabilities that already operate inside approved local boundaries.

Custom full workflow logic is not approved until mature-tool options and deterministic local processing have been considered for the capability.

Source: defaulted from KNX workflow.

## Source Mutation Posture

KNX workflows remain read/planning-only by default.

Source mutation requires a later explicit decision for a named workflow. That decision must record exact target paths, allowed file operations, rollback or recovery plan, validation plan, safety review result, and user approval for the mutation scope.

Local Git staging and local commits for scoped KNX governance and validator records are approved separately and do not authorize operational source mutation.

## GitHub And Remote Posture

GitHub, Git remotes, pushes, pulls, PRs, issues, actions, releases, deployments, and remote review workflows remain disabled by default.

Local Git status, diff, log, staging, and commits are allowed only for scoped KNX governance and validator records under the local Git decision.

Any future GitHub/remote workflow requires a named workflow, remote target, exact operation class, data-egress description, credential boundary, rollback or recovery plan, safety review, and explicit user approval.

## Deterministic-First Rule

Use deterministic local processing before model calls for work that can be handled by parsing, validation, static analysis, structured transforms, fixtures, formatting, or repeatable checks.

Source: defaulted from KNX workflow.

## Local Compute And Model Assumptions

- Local compute policy: local-first.
- Source: profile-derived from `_bmad/config.yaml` and `_bmad/config.user.yaml`.
- GPU/local accelerator availability: unknown.
- Source: profile-derived; local `nvidia-smi` was not found on 2026-06-01, which does not confirm accelerator absence.
- Local model runtime: unresolved.
- Effective rule: do not recommend GPU-specific or local-model-specific execution as confirmed until availability is explicitly recorded.
- Decision: do not treat local model runtime, GPU, or local accelerator processing as available or approved by default. A future local model/GPU workflow requires a named capability, local runtime or hardware evidence, model/tool identity, content-read boundary, safety review, and explicit user approval.

## Custom-Code Rule

Custom glue code is allowed only as layer 4 after the mature-tool-first and deterministic-first checks have been applied.

Custom code may be recommended for:

- Import/export adapters.
- Validation and evidence formatting.
- Local orchestration.
- Source-packet preparation.
- Last-mile automation inside approved local boundaries.

Custom code is deferred or blocked when:

- It would mutate unapproved source roots.
- It would write live deployment/runtime state outside the approved storage root.
- It would access credentials, account/security settings, customer systems, or production systems.
- It replaces a mature tool without a recorded reason.

Source: defaulted from KNX workflow and profile safety rules.

## External Provider Rule

External provider use is layer 5 and last-resort only.

Current policy: `per-use-approval-only`.

Effective rule while the profile is partial:

- No external provider sends unless the user gives explicit approval for the specific send.
- Do not send credentials, account/security data, customer data, production data, or ambiguous source material.
- Do not treat provider availability as approval.

Source: profile-derived from config and expanded with KNX safety defaults.

## Exception Process

Any exception that allows custom full workflow logic, source mutation, external provider use, or writes outside the approved storage root must record:

- Capability and intended outcome.
- Requested execution layer.
- Prior layers considered and why they were insufficient.
- Data sent, read, written, or mutated.
- Boundary and approval basis.
- Expiration or review condition, if applicable.

Accepted exceptions must be written to `decisions/execution-policy-YYYY-MM-DD.md` or a more specific decision record before downstream workflows rely on them.

Source: defaulted from KNX workflow.

## Fast-Lane Local Governance

Decision: low-risk local KNX governance, evidence, validation, runtime packet, and local commit work may proceed without per-step user interaction when it satisfies `decisions/fast-lane-local-governance-2026-06-01.md`.

This does not approve IDE/workspace configuration writes, source mutation outside scoped KNX governance/evidence records, external sends, company sharing, GitHub/remotes, public distribution, license grants, customer/production access, credential/account-security workflows, local model/GPU processing, destructive actions, risk score `9` waivers, or writes outside approved KNX memory/runtime locations.

## Handoffs To `knx-mature-tool-review`

Use `knx-mature-tool-review` before trusting a capability recommendation when:

- Current package, provider, platform, or tool research is required.
- A custom-code recommendation would replace an existing mature tool category.
- The capability involves source indexing, document processing, local model runtime, vector search, browser automation, workflow orchestration, or external provider integration and the mature option landscape is not already known.

Source: defaulted from KNX workflow.

## Open Questions

No open execution-policy questions remain for the current governance and local evidence scope.

## Decision Sources

- Policy status: profile-derived and defaulted.
- Execution ladder: defaulted.
- Mature-tool-first rule: defaulted.
- Deterministic-first rule: defaulted.
- Local compute policy: profile-derived.
- GPU/local accelerator availability: profile-derived as unknown; `nvidia-smi` not found locally on 2026-06-01.
- Local model status: unresolved.
- Custom-code rule: defaulted.
- External provider rule: user-specified per-use approval only.
- Exception process: defaulted.
- Handoffs: defaulted.
- Source mutation posture: `decisions/source-mutation-posture-2026-06-01.md`.
- Local model/GPU posture: `decisions/local-model-gpu-posture-2026-06-01.md`.
- GitHub/remote posture: `decisions/github-remote-posture-2026-06-01.md`.
