---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 3.3: Enforce Evidence Redaction And Required Fields

Status: done

## Story

As a reviewer,
I want evidence to include the required operational fields while excluding secrets,
so that install proof is useful and safe to retain.

## Acceptance Criteria

1. Given evidence is generated, when validation runs, then required operational fields and redaction categories are checked.
2. Given evidence text fields include token values, private key material, auth URLs, device codes, credential helper output, shell history, or environment dumps, when validation runs, then validation fails.
3. Given evidence includes required redaction labels such as `provider-tokens` or `private-keys`, when validation runs, then those labels do not create false positive secret findings.

## Tasks / Subtasks

- [x] Add retained-text redaction validation. (AC: 2-3)
  - [x] Reject private key material.
  - [x] Reject GitHub and provider token-like values.
  - [x] Reject auth URLs and device-code text.
  - [x] Reject credential helper output, shell history, and environment dump text.
  - [x] Skip redaction labels during forbidden-text scanning.
- [x] Add focused schema tests. (AC: 1-3)
  - [x] Clean install evidence with required redaction labels validates.
  - [x] Leaked token/auth URL/private-key text fails validation.
- [x] Update lane tracking and index coverage. (AC: 1-3)
  - [x] Story 3.3 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 3.3 and its coverage notes.
- [x] Run focused and full lane verification. (AC: 1-3)
  - [x] `node --test tests/linux-bootstrap/evidence-schema.test.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR20: evidence must include operational proof while excluding secrets.
  - NFR3: evidence must exclude raw credential output, auth URLs, device codes, token values, credential helper output, shell history, broad environment dumps, private keys, and broad home-directory listings.
- Existing code:
  - `scripts/lib/linux-bootstrap/evidence-schema.mjs` validates evidence structure.
  - `tests/linux-bootstrap/evidence-schema.test.mjs` covers evidence validation rules.

### Target Files

- `scripts/lib/linux-bootstrap/evidence-schema.mjs`
- `tests/linux-bootstrap/evidence-schema.test.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not scan `redactions` labels as leaked content.
- Keep patterns specific enough to avoid failing ordinary recovery text.
- Do not add evidence retention for raw command output, secrets, environment dumps, private key material, or auth flow payloads.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node --test tests/linux-bootstrap/evidence-schema.test.mjs`
- `node ./scripts/check-linux-bootstrap.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Added forbidden retained-text validation across evidence fields, excluding redaction label arrays.
- Added tests proving leaked token/auth URL/private-key text fails while required redaction labels remain valid.
- Verification passed:
  - `node --test tests/linux-bootstrap/evidence-schema.test.mjs`
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `scripts/lib/linux-bootstrap/evidence-schema.mjs`
- `tests/linux-bootstrap/evidence-schema.test.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- `docs/linux-install/planning/stories/3-3-enforce-evidence-redaction-and-required-fields.md`
- `_bmad-output/implementation-artifacts/3-3-enforce-evidence-redaction-and-required-fields.md`
