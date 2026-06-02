# KNX Local Backlog

Date: 2026-06-01

Status: active local-only backlog

## Active

1. Continue the approved local-only greenfield implementation lane for the installable KNX governance core plus standalone `ksev` validator.
2. Apply the default-proceed local workflow for eligible KNX governance, evidence, validation, packaging, handoff, and local commit work.
3. Maintain the greenfield implementation runway under `_bmad/memory/knx/runtime/greenfield-implementation/`.
4. Keep `ksev` shared local config/help registration current.
5. Revalidate `knx` and `ksev` packaging only when scoped module assets change.
6. Route any new fixture/evidence changes through `knx-source-evidence-contract`.
7. Keep approved KNX path metadata inventory current under `_bmad/memory/knx/runtime/greenfield-implementation/inventory/`.
8. Route any new tooling or source inventory materialization beyond the accepted Gate 3 scope through `knx-mature-tool-review` first.
9. Work through hard-gated paths in the order recorded in `_bmad/memory/knx/runtime/greenfield-implementation/hard-gate-workthrough-plan-2026-06-01.md`.
10. Keep `ksev` distribution readiness local-only until a later remote/publication gate is approved.
11. Keep GitHub/remotes disabled until a later target URL and operation class are explicitly approved.
12. Keep company evaluation planning local-only until exact audience, sharing mechanism, final artifact list, legal review path, and send/access action are explicitly approved.
13. Keep IDE/workspace planning local-only until exact IDE target, file paths, action behavior, rollback plan, validation plan, user-visible behavior, and safety contract are explicitly approved.
14. Keep runtime assistant behavior planning local-only until exact storage, triggers, execution context, user-visible behavior, rollback, validation, and safety contract are explicitly approved.
15. Keep local model/GPU processing planning local-only until exact hardware target, model/runtime, source classes, storage, execution context, resource limits, rollback, validation, and safety contract are explicitly approved.

## Parked

- Company-facing sharing and external send. Company evaluation planning is local-only.
- IDE one-click action. IDE/workspace planning is local-only.
- Public distribution and license activation.
- GitHub/remotes.
- Operational source intake and source mutation.
- Runtime assistant behavior implementation.
- Local model/GPU processing implementation.

## Hard-Gated

- External sends.
- Company sharing.
- IDE/workspace configuration.
- Writes outside approved KNX memory/runtime storage, except approved local KNX module/report/config/help paths in `decisions/write-boundary-knx-local-2026-06-01.md`.
- Customer/production access.
- Credentials or account/security workflows.
- Local model/GPU processing.
- Risk score `9` waivers.

## Current Recommendation

Proceed with the approved local-only greenfield implementation lane by default. Stop only for hard gates, genuine user input requirements, or user pause. Do not reopen parked or hard-gated paths without a separate explicit decision.
