---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 1.3: Provide Non-Mutating Plan And Verify Modes

Status: review

## Story

As a maintainer,
I want plan and verify-only modes that do not mutate packages, repo state, services, providers, or cleanup targets,
so that readiness can be inspected before apply authority is used.

## Acceptance Criteria

1. Given the repo-owned controller is run with plan mode, when gates and manual steps are reported, then no mutation occurs and output names stop lines and the single mutating bootstrap path.
2. Given verify-only mode is run, when readiness checks execute, then no package, provider, service, repo-clone, or cleanup mutation occurs.
3. Given verify-only mode fails, when the result is reported, then failures are typed readiness results and evidence remains schema-compliant.

## Tasks / Subtasks

- [x] Strengthen plan-mode tests. (AC: 1)
  - [x] Plan mode writes no evidence.
  - [x] Plan mode records no mutations.
  - [x] Plan mode names `scripts/bootstrap-linux.sh --install-kendall-vnxt` as the single mutating path.
- [x] Strengthen verify-only tests. (AC: 2-3)
  - [x] Verify-only records only evidence-file mutation.
  - [x] Verify-only does not invoke bootstrap install, git clone, or `pnpm run setup`.
  - [x] Verify-only failures remain typed and schema-valid.
- [x] Run focused verification. (AC: 1-3)
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR7: non-mutating plan mode that prints planned gates, auth boundaries, stop lines, and manual next steps.
  - FR8: verify-only mode checks local readiness without package, repo, provider, service, or cleanup mutation.
- Architecture input: `docs/linux-install/planning/linux-install-architecture-input.md`
  - Node controller supports plan and verify behavior; v1 mutation is limited to shell bootstrap.
- Current code:
  - `scripts/lib/linux-bootstrap/controller.mjs` implements plan-only gates and verify-only flow.
  - `tests/linux-bootstrap/controller.test.mjs` already covers plan gate sequence and verify-only evidence.

### Target Files

- `tests/linux-bootstrap/controller.test.mjs`
- `scripts/lib/linux-bootstrap/controller.mjs` only if tests expose a real behavior gap.
- `docs/linux-install/planning/lane-status.md`
- This story file and tracked story copy.

### Implementation Guardrails

- Do not change install semantics unless a test exposes a real mutation boundary gap.
- Do not add package installs, repo clones, setup runs, provider calls, login flows, reboot, cleanup, PR creation, merge, or GitHub operations.
- Preserve `scripts/bootstrap-linux.sh --install-kendall-vnxt` as the only mutating install path.

### Testing Requirements

Run:

```bash
node ./scripts/check-linux-install-lane.mjs
node ./scripts/check-doc-indexes.mjs
node ./scripts/check-linux-bootstrap.mjs
node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json
```

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node --test tests/linux-bootstrap/controller.test.mjs`
- `node ./scripts/check-linux-bootstrap.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Strengthened `tests/linux-bootstrap/controller.test.mjs` so plan mode asserts no evidence, no mutations, no executor calls, and explicit single mutating bootstrap path guidance.
- Strengthened verify-only controller coverage so passing verify-only records only `evidence-file`, does not invoke bootstrap install, does not run git clone, and does not run setup.
- Confirmed existing verify-only failure evidence remains typed and schema-valid.
- Verification passed:
  - `node --test tests/linux-bootstrap/controller.test.mjs`
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `tests/linux-bootstrap/controller.test.mjs`
- `docs/linux-install/planning/stories/1-3-provide-non-mutating-plan-and-verify-modes.md`
- `_bmad-output/implementation-artifacts/1-3-provide-non-mutating-plan-and-verify-modes.md`
