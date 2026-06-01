# Local Model And GPU Posture Decision - KNX

Last updated: 2026-06-01

## Decision Status

Status: accepted

Decision: do not treat local model runtime, GPU, or local accelerator processing as available or approved by default.

## Rule

KNX workflows must not assume:

- local model runtime availability,
- GPU availability,
- local accelerator availability,
- semantic classification by local model,
- model-derived source summaries or labels.

Any future local model/GPU workflow requires:

- named workflow or capability,
- exact processing purpose,
- local runtime or hardware evidence,
- source classes affected,
- storage paths,
- model/tool identity,
- content-read boundary,
- safety review,
- explicit user approval.

## Current Allowed Alternatives

Use deterministic local processing and mature local tools first:

- Git CLI.
- ripgrep.
- PowerShell grouping.
- Python standard library validators already reviewed for the optional `ksev` pack.

## Rationale

Local `nvidia-smi` was not found earlier on 2026-06-01, and local model runtime status is unresolved. The safe default is to avoid relying on local model/GPU processing until a concrete need and evidence exist.

## Decision Sources

- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/decisions/mature-tool-source-inventory-2026-06-01.md`
- User instruction to continue recommended decisions on 2026-06-01.
