---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 1.1: Declare Certified Ubuntu Target And Single Install Method

Status: done

## Story

As a Kendall_Nxt installer operator,
I want the docs and contract to identify Ubuntu 26.04+ local execution as the only supported v1 install path,
so that I do not follow stale SSH, remote, staged, or manual fallback instructions.

## Acceptance Criteria

1. Given the Linux install docs are reviewed, when the supported v1 install path is described, then Ubuntu 26.04+ with an existing non-root sudo user is the certified target, and SSH, remote execution, staged scripts, Windows orchestration, and manual fallback paths are clearly excluded.
2. Given historical Linux install documents remain in the repo, when a reviewer starts from `docs/linux-install/index.md`, then historical, lab-instance, SSH, remote, or platform-evaluation notes are labeled non-authoritative for v1 and cannot override the generic install path.
3. Given docs mention unsupported future command examples, when those examples are retained, then they must be explicitly labeled future/not implemented and must not appear in generic supported install instructions.
4. Given the lane is verified, when `node ./scripts/check-linux-install-lane.mjs`, `node ./scripts/check-doc-indexes.mjs`, and `node ./scripts/check-linux-bootstrap.mjs` run, then all checks pass.

## Tasks / Subtasks

- [x] Audit supported-path docs for the certified target and single-method language. (AC: 1)
  - [x] Check `docs/linux-install/index.md`.
  - [x] Check `docs/linux-install/install-playbook.md`.
  - [x] Check `docs/linux-install/install-contract.md`.
  - [x] Check `docs/linux-install/one-command-bootstrap-plan.md`.
- [x] Audit historical or lab-specific docs for non-authoritative labels. (AC: 2)
  - [x] Check `docs/linux-install/bob-next-steps.md`.
  - [x] Check `docs/linux-install/implementation-plan.md`.
  - [x] Check `docs/linux-install/remote-approval-template.md`.
  - [x] Check `docs/linux-install/ssh-key-policy.md`.
  - [x] Check `docs/platform-evaluation-sprint.md` only if linked by Linux install navigation.
- [x] Preserve future-command examples only when explicitly labeled. (AC: 3)
  - [x] Do not convert future remote/apply examples into supported commands.
  - [x] Do not remove historical examples solely to make checks pass.
- [x] Update or add targeted drift coverage only if the current checks do not protect the single-method boundary. (AC: 4)
  - [x] Prefer extending `scripts/check-linux-install-contract.mjs` or `scripts/check-linux-install-lane.mjs` over creating broad new checks.
- [x] Run focused verification. (AC: 4)
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR1 defines Ubuntu 26.04 LTS or later as the first certified Linux target.
  - FR2 defines exactly one v1 install method: a local Linux user runs the single bootstrap command or script from inside Ubuntu.
  - FR25 requires the docs to separate generic supported install path from historical, lab-instance, SSH, or platform-evaluation notes.
  - NFR10 prohibits reintroducing SSH, remote execution, or manual fallback paths as supported v1 methods.
- Architecture input: `docs/linux-install/planning/linux-install-architecture-input.md`
  - Technical boundary: single local bootstrap path; unsupported paths include SSH-driven orchestration, Windows-to-Linux remote execution, staged remote scripts, manual fallback install sequences, provider login, browser/device-code auth automation, Tailscale enrollment, persistent service launch, reboot, and destructive cleanup.
- Epic/story breakdown: `docs/linux-install/planning/linux-install-epics-and-stories.md`
  - Epic 1 covers FR1-FR10.
  - Story 1.1 covers FR1 and FR2.
- Readiness report: `docs/linux-install/planning/implementation-readiness-report-2026-06-18.md`
  - Overall status is `NEEDS WORK` only because execution-ready story files were missing before this story.
  - No FR coverage gaps were found.

### Target Files

Likely update targets:

- `docs/linux-install/index.md`
- `docs/linux-install/install-playbook.md`
- `docs/linux-install/install-contract.md`
- `docs/linux-install/one-command-bootstrap-plan.md`
- `docs/linux-install/validation-matrix.md`
- `docs/linux-install/release-gate-traceability.md`
- `scripts/check-linux-install-contract.mjs`
- `scripts/check-linux-install-lane.mjs`

Read-only audit targets unless a gap is found:

- `docs/linux-install/bob-next-steps.md`
- `docs/linux-install/implementation-plan.md`
- `docs/linux-install/remote-approval-template.md`
- `docs/linux-install/ssh-key-policy.md`
- `docs/platform-evaluation-sprint.md`

### Implementation Guardrails

- Keep v1 scoped to Ubuntu 26.04+ and an existing non-root sudo-capable Linux user.
- Keep the supported path local in-distro only.
- Do not promote SSH, remote execution, staged scripts, Windows orchestration, manual fallback sequences, or controller `--apply` examples into supported v1 instructions.
- Do not run package installs, provider calls, login flows, reboot, cleanup, PR creation, merge, or GitHub operations for this story.
- Historical docs can remain if labeled historical, lab-instance, or non-authoritative.
- Future examples can remain if they are explicitly marked future/not implemented.
- Do not change runtime installer behavior unless the docs audit exposes a real contract drift gap that needs a check update.

### Testing Requirements

Run:

```bash
node ./scripts/check-linux-install-lane.mjs
node ./scripts/check-doc-indexes.mjs
node ./scripts/check-linux-bootstrap.mjs
```

If evidence file references change, also run:

```bash
node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json
```

### Project Structure Notes

- BMAD local story state lives at `_bmad-output/implementation-artifacts/1-1-declare-certified-ubuntu-target-and-single-install-method.md`.
- The tracked lane copy lives at `docs/linux-install/planning/stories/1-1-declare-certified-ubuntu-target-and-single-install-method.md`.
- Update `docs/linux-install/planning/lane-status.md` after implementation or meaningful blocker discovery.

### References

- `docs/prds/linux-install-mvp.md`
- `docs/linux-install/planning/linux-install-architecture-input.md`
- `docs/linux-install/planning/linux-install-epics-and-stories.md`
- `docs/linux-install/planning/implementation-readiness-report-2026-06-18.md`
- `docs/linux-install/index.md`
- `docs/linux-install/install-contract.md`
- `docs/linux-install/one-command-bootstrap-plan.md`
- `docs/linux-install/validation-matrix.md`

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `rg` audit for Ubuntu/single/local/SSH/remote/staged/fallback language across Linux install docs.
- Focused verification commands listed in Completion Notes.
- BMAD code-review prompt files generated under `_bmad-output/implementation-artifacts/review-prompt-*-story-1-1.md` because subagent tooling is unavailable in this environment.

### Completion Notes List

- Audited supported-path docs and historical/lab-specific docs for Story 1.1 boundaries.
- Found stale local command syntax in `docs/linux-install/validation-matrix.md`, `docs/linux-install/one-command-bootstrap-plan.md`, and `docs/linux-install/install-playbook.md`.
- Corrected stale `pnpm run linux:bootstrap -- --plan/-- --verify-only` references to `pnpm run linux:bootstrap --plan/--verify-only` in active supported docs.
- Extended `scripts/check-linux-install-lane.mjs` to guard against stale command syntax in active Linux install docs.
- Preserved future remote/apply examples only where explicitly labeled future/not implemented.
- Verification passed:
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`
- In-session review found no additional actionable Story 1.1 defects after the lane-check state-machine fix. Formal parallel reviewer prompts were generated for later independent review.

### File List

- `docs/linux-install/install-playbook.md`
- `docs/linux-install/one-command-bootstrap-plan.md`
- `docs/linux-install/validation-matrix.md`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/planning/stories/1-1-declare-certified-ubuntu-target-and-single-install-method.md`
- `_bmad-output/implementation-artifacts/1-1-declare-certified-ubuntu-target-and-single-install-method.md`
- `_bmad-output/implementation-artifacts/review-prompt-blind-hunter-story-1-1.md`
- `_bmad-output/implementation-artifacts/review-prompt-edge-case-hunter-story-1-1.md`
- `_bmad-output/implementation-artifacts/review-prompt-acceptance-auditor-story-1-1.md`
