# Artifact ID Convention Decision - KNX

Last updated: 2026-06-01

## Decision Status

Status: accepted

Decision: use deterministic, human-readable local artifact IDs for KNX source/evidence records.

## ID Format

Use this general pattern:

```text
knx-{artifact-kind}-{yyyy-mm-dd}-{sequence}
```

Where:

- `knx` is the local module prefix.
- `{artifact-kind}` is a short lowercase kebab-case kind.
- `{yyyy-mm-dd}` is the creation date.
- `{sequence}` is a three-digit local sequence for that artifact kind and date.

## Artifact Kinds

Recommended artifact kind prefixes:

- `source-packet`
- `work-trace`
- `validation`
- `user-input`
- `decision`
- `fixture`
- `output`
- `source-inventory`
- `validator-run`

Examples:

- `knx-source-packet-2026-06-01-001`
- `knx-work-trace-2026-06-01-001`
- `knx-validation-2026-06-01-001`
- `knx-output-2026-06-01-001`

## Rules

- IDs are local and stable after creation.
- IDs do not encode customer, credential, account, production, private-source, or external-provider details.
- IDs must not depend on GitHub, remotes, external services, local model/GPU processing, or runtime assistant state.
- If an artifact is superseded, create a new ID and link back through `supersedes` or a decision record.
- Do not reuse IDs for materially different artifacts.

## Rationale

This convention is simple enough for humans to read, deterministic enough for local workflows, and avoids external services or opaque generated identifiers.

## Decision Sources

- `_bmad/memory/knx/source-evidence-contract.md`
- Existing source inventory evidence IDs under `_bmad/memory/knx/runtime/source-inventory/`
- User instruction to continue recommended decisions on 2026-06-01.
