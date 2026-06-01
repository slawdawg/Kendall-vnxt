# KNX Execution Policy

Last updated: 2026-05-31

## Policy Status

Status: provisional

Reason: the base execution ladder is defined, storage root and read/planning source root are approved, and GitHub/remote workflows are disabled for now. The policy remains provisional because GPU/local accelerator availability and local model status are unresolved, and source mutation remains approval-gated.

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

## Handoffs To `knx-mature-tool-review`

Use `knx-mature-tool-review` before trusting a capability recommendation when:

- Current package, provider, platform, or tool research is required.
- A custom-code recommendation would replace an existing mature tool category.
- The capability involves source indexing, document processing, local model runtime, vector search, browser automation, workflow orchestration, or external provider integration and the mature option landscape is not already known.

Source: defaulted from KNX workflow.

## Open Questions

1. Is a GPU, local accelerator, or local model runtime available and approved?
2. Should any future workflow expand beyond read/planning into source mutation?
3. Should any future workflow enable GitHub/remote source-review behavior?

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
