# KNX Source Packet Residual Review

Date: 2026-06-19
Status: residual cleanup review

## Purpose

Review the tracked `source-packets/**` runtime group after the local KNX
runtime evidence cleanup. This group was intentionally excluded from the
69-file untracking batch because it contains metadata-only source packet
examples and validation evidence used by KNX source/evidence workflows.

## Reviewed Files

- `_bmad/memory/knx/runtime/source-packets/source-packet-examples-2026-06-01.json`
- `_bmad/memory/knx/runtime/source-packets/source-packet-examples-2026-06-01.md`
- `_bmad/memory/knx/runtime/source-packets/validation-source-packet-examples-2026-06-01.json`
- `_bmad/memory/knx/runtime/source-packets/work-trace-source-packet-examples-2026-06-01.md`
- `_bmad/memory/knx/runtime/source-packets/validator-report/source-evidence-validation.json`
- `_bmad/memory/knx/runtime/source-packets/validator-report/source-evidence-validation.md`

## Decision

Keep `source-packets/**` tracked for now. The files are small, metadata-only,
and remain useful as durable examples of the first approved source packet
classes:

- `user-authored-planning-document`
- `public-or-synthetic-sample-data`
- `generated-report`

Sanitize the one concrete local storage-root value in the generated validator
report JSON by replacing it with a project-root token:

- from: machine-specific absolute Windows workspace path
- to: `{project-root}\\_bmad\\memory\\knx\\runtime`

This preserves the evidence shape while removing Bob-specific path material
from the remote repository.

## Boundaries Preserved

- No source packet files are deleted.
- No source packet files are untracked.
- No source packet classes are changed.
- No copied source content is introduced.
- No source mutation, external send, GitHub/remote operation, package install,
  runtime assistant behavior, customer/production access, or credential
  workflow is approved.

## Verification Required

- JSON parse for
  `_bmad/memory/knx/runtime/source-packets/validator-report/source-evidence-validation.json`.
- Local-marker scan over `_bmad/memory/knx/runtime/source-packets/**`.
- Tracked runtime local-marker scan.
- `ksev` source packet example validation in `--no-write` mode.
- Docs index check.
- Diff whitespace check.

## Verification Result

- JSON parse: pass.
- Source-packet local-marker scan: no matches.
- Tracked runtime local-marker scan: no matches.
- `ksev` source packet example validation with `--no-write`: pass, 3 source
  packets, 0 errors, 0 warnings, 0 findings.
- Docs index check: pass.
- Diff whitespace check: pass.

## Related Records

- `docs/workflows/knx-runtime-cleanup-execution-report-2026-06-19.md`
- `docs/workflows/knx-runtime-cleanup-decision-2026-06-19.md`
- `_bmad/memory/knx/source-evidence-contract.md`
