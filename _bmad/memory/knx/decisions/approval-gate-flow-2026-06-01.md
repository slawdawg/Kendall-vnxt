# Approval Gate Flow Decision - KNX

Last updated: 2026-06-01

## Decision Status

Status: accepted

Decision: when KNX reaches a gated action, present the current gate with a short proposal summary and why it is gated. After approval, execute the approved work and immediately present the next gate details without waiting for the user to ask "next."

## Required Gate Format

Each gate presentation should include:

- short summary of what is being proposed,
- why this is gated,
- scope,
- exclusions,
- artifacts or actions to be created,
- validation to run,
- whether local commit is included,
- next expected gate if approval is granted.

## Execution Flow

1. Present the current gate.
2. Wait for user approval.
3. Execute only the approved scope.
4. Validate the result.
5. Commit locally when the change is scoped KNX governance/validator/evidence work and local commit policy allows it.
6. Present the next gate details immediately, including summary and why gated.

## Boundaries

This flow does not pre-approve:

- GitHub/remotes,
- public distribution,
- source mutation,
- broader or operational source inventory generation,
- external sends/providers,
- local model/GPU processing,
- customer/production access,
- credentials or account/security workflows,
- runtime assistant behavior,
- writes outside approved storage.

Those still require explicit gate approval.

## Decision Sources

- User instruction on 2026-06-01.
- `_bmad/memory/knx/index.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/execution-policy.md`
