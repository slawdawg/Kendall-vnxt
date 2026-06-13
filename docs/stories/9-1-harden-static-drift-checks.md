---
baseline_commit: e07aad9d2e174a400695e6bd36134e5c5678ab86
---

# Story 9.1: Harden Static Drift Checks

Status: done

## Story

As Bob,
I want runtime-evidence drift checks to fail on meaningful semantic drift instead of brittle or incomplete static signals,
so that launch readiness, dashboard copy, and evidence-retention boundaries remain trustworthy as the implementation evolves.

## Acceptance Criteria

1. Given runtime evidence, dashboard readiness copy, or evidence-export contracts change, when Kendall runs the static drift checks, then the checks validate the relevant structured fields, safety-boundary terms, and retained-evidence semantics, and failure output names the affected evidence surface and expected invariant.
2. Given static drift fixtures cover an Epic 9 drift rule, when the drift checks run against known-good and known-bad local fixtures, then the known-good fixture passes, the known-bad fixture fails, and the failure message names the violated rule.
3. Given a check can be expressed through structured or behavioral assertions, when the drift guard is implemented or updated, then it avoids relying only on broad string presence checks and remains deterministic without live provider calls, subscription credentials, external sessions, or network access.
4. Given a safety stop line remains in force, when drift checks evaluate Epic 9 surfaces, then provider expansion, credential/session access, source mutation, launch retry automation, PR/merge/cleanup automation, failed-check bypass, and broad autonomy remain blocked.
5. Given Story 9.1 is complete, then no new runtime authority rules are introduced beyond FR29-FR33 and NFR13-NFR15.

## Tasks / Subtasks

- [x] Identify and scope the existing static drift checks to harden. (AC: 1, 3, 4)
  - [x] Start with `scripts/check-runtime-evidence-export.mjs`, which currently reads source files and uses direct `includes()` assertions for runtime export, subscription launch readiness, dashboard rendering, browser assertions, and story evidence.
  - [x] Include adjacent drift checks only where needed for the same evidence boundary: `scripts/check-process-lifecycle-policy.mjs` and `scripts/check-execution-boundary-reports.mjs`.
  - [x] Do not create a parallel drift-check framework unless the existing scripts cannot express the required fixture-backed checks.
- [x] Add local deterministic fixtures for static drift behavior. (AC: 2, 3)
  - [x] Include at least one known-good and one known-bad fixture for each newly hardened rule.
  - [x] Keep fixtures limited to static report, schema, and drift examples; do not use dashboard rendering fixtures, provider behavior fixtures, subscription event-store fixtures, live provider calls, credentials, sessions, or network access.
  - [x] Prefer small committed fixtures near the check script or under an explicit fixture directory such as `scripts/fixtures/runtime-evidence-drift/`.
- [x] Replace or supplement fragile string-only checks with structured or behavioral assertions where practical. (AC: 1, 2, 3)
  - [x] Parse JSON, TypeScript/JavaScript objects, markdown sections, or Python class/source structure where the local toolchain makes that practical.
  - [x] Keep existing string checks only when they are the clearest low-risk guardrail, and pair broad presence checks with a more specific invariant when possible.
  - [x] Ensure each failure message names the violated rule, expected evidence surface, and file or fixture involved.
- [x] Preserve the authority and evidence-retention stop lines. (AC: 4, 5)
  - [x] Keep raw prompts, completions, reasoning traces, provider payloads, secrets, raw stdout/stderr, generated patch content, and unnecessary source snapshots out of retained workflow evidence.
  - [x] Do not add provider expansion, credential/session access, source mutation, launch retry automation, PR/merge/cleanup automation, failed-check bypass, real process launch, or broad autonomy.
- [x] Update story and verification evidence. (AC: 1-5)
  - [x] Update this story's Dev Agent Record, Completion Notes, and File List during implementation.
  - [x] Update `docs/stories/index.md` only if story indexing or wording changes are needed after implementation.

### Review Findings

- [x] [Review][Patch] Couple fixture validation to live runtime export source surfaces — accepted from Blind Hunter, Edge Case Hunter, and Acceptance Auditor; fixed by adding schema/service source-surface validation for safety defaults, boundary fields, subscription launch fields, export composition, excluded state, fail-closed safety defaults, and subscription launch summary composition.
- [x] [Review][Patch] Expand known-bad fixture coverage for every hardened invariant — accepted from Edge Case Hunter; fixed by making the known-bad fixture fail every required structured-field, safety-boundary, retained-evidence, route, verification-command, and fixture-family rule.
- [x] [Review][Patch] Improve fixture failure and JSON parse diagnostics — accepted from Blind Hunter, Edge Case Hunter, and Acceptance Auditor; fixed by adding fixture-path parse errors and failure messages that include the affected evidence surface and expected invariant.
- [x] [Review][Patch] Align story index lifecycle with review/done state — accepted from Blind Hunter; fixed by changing the Story 9.1 index summary from ready-for-dev to in-review before review closeout.

## Dev Notes

### Source Context

- Epic 9 exists to harden runtime evidence trust, dashboard/report regression coverage, and subscription launch mutation semantics discovered during Epic 8 closeout before granting more runtime authority. Story 9.1 covers FR29, FR30, FR33, NFR13, and the Epic 9 fixture invariant. [Source: `_bmad-output/planning-artifacts/epics.md#Epic 9: Runtime Evidence Trust And Mutation Boundary Hardening`]
- Epic 8 retrospective identifies the specific 9.1 problem: "Drift checks still lean too heavily on string-grep assertions" and recommends replacing or supplementing fragile string-grep drift checks with behavioral checks where practical. [Source: `_bmad-output/implementation-artifacts/epic-8-retro-2026-06-13.md#Challenges`]
- Deferred work records the same risk as a broader hardening task, not a Story 8.5/8.6 patch: "Static drift check remains string-grep coverage rather than behavioral coverage." [Source: `_bmad-output/implementation-artifacts/deferred-work.md#Deferred from: code review of 8-5-execute-one-explicitly-approved-artifact-only-subscription-agent-launch (2026-06-12)`]

### Existing Implementation To Reuse

- `package.json` already defines the relevant static check chain: `check:runtime-export`, `check:process-lifecycle`, `check:execution-boundary`, `check:docs`, and full `check`. Reuse those scripts instead of inventing a disconnected verifier.
- `scripts/check-runtime-evidence-export.mjs` currently reads `package.json`, shared contracts, supervisor schemas/service/API files, dashboard panels, report shortcuts, dashboard E2E tests, supervisor tests, and story index evidence, then accumulates named failures. Preserve that failure-collection pattern while making the assertions more semantic.
- Existing check scripts are plain Node ESM scripts. Use built-in Node modules and lightweight parsing already available in the repo unless a dependency is clearly justified.

### Architecture And Safety Boundaries

- Generic continuation language does not approve provider calls, process launch, command execution, source mutation by workers, network access, credential access, premium execution, or background runtime assistant behavior. Story 9.1 is safe planning/test/control-plane hardening only. [Source: `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md#Language That Is Not Approval`]
- Worker/provider execution remains blocked until a later provider-specific policy approves prompt/evidence redaction, command allowlisting, provider endpoint and network access, credential access, and artifact retention/export. Story 9.1 must not weaken that boundary. [Source: `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md#Boundary Summary`]
- Runtime evidence exports may include work item, event, attempt, route, workspace isolation, and artifact reference metadata, but must not include broad filesystem snapshots or secret-bearing payloads. [Source: `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md#Artifact Boundary`]
- Future process launch design requires output/artifact evidence as bounded references, not embedded workflow-event payloads; direct launch remains below the stop line. [Source: `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md#Output And Artifact Requirements`]

### Fixture Ownership

- Story 9.1 owns static report, schema, and drift fixtures only.
- Story 9.1 must not own dashboard rendering/raw-output fixtures for 9.3 or subscription/event-store/idempotency fixtures for 9.2.
- Fixture tests must be local, deterministic, and runnable without provider/network/session/credential access.

### Testing

Minimum focused verification:

- `node --check scripts/check-runtime-evidence-export.mjs`
- `pnpm.cmd run check:runtime-export`
- `pnpm.cmd run check:process-lifecycle` if process-lifecycle drift assertions are touched
- `pnpm.cmd run check:execution-boundary` if execution-boundary assertions are touched
- `pnpm.cmd run check:docs`

Broaden before review when implementation touches shared contracts, dashboard evidence surfaces, supervisor evidence construction, or package check wiring:

- `pnpm.cmd run check`

## Project Structure Notes

- Preferred story record location is `docs/stories/`.
- Static check scripts live under `scripts/`.
- Shared API contracts live under `packages/contracts/src/api.ts`.
- Supervisor schemas and evidence construction live under `services/supervisor/src/supervisor/api/` and `services/supervisor/src/supervisor/application/`.
- Dashboard evidence rendering lives under `apps/dashboard/src/components/`.
- Avoid repo-wide formatting or unrelated drift-check rewrites.

## References

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/implementation-artifacts/epic-8-retro-2026-06-13.md`
- `_bmad-output/implementation-artifacts/deferred-work.md`
- `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`
- `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`
- `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md`
- `docs/stories/3-31-runtime-evidence-export-drift-check.md`
- `docs/stories/8-6-record-verification-recovery-and-rollback-evidence.md`
- `package.json`
- `scripts/check-runtime-evidence-export.mjs`

## Dev Agent Record

### Agent Model Used

TBD

### Debug Log References

- Red phase: `pnpm.cmd run check:runtime-export` failed with `ReferenceError: validateRuntimeEvidenceDriftFixtures is not defined` after wiring the new fixture validator call.
- Green phase: `pnpm.cmd run check:runtime-export` passed after implementing fixture-backed runtime evidence drift validation.
- Syntax verification: `node --check scripts\check-runtime-evidence-export.mjs` passed.
- Documentation verification: `pnpm.cmd run check:docs` passed.
- Full regression: `pnpm.cmd run check` passed, including dashboard build and 163 supervisor tests.
- Code review patch verification: `pnpm.cmd run check:runtime-export`, `node --check scripts\check-runtime-evidence-export.mjs`, `pnpm.cmd run check:docs`, and full `pnpm.cmd run check` passed after review fixes.

### Completion Notes List

- Added local deterministic known-good and known-bad static drift fixtures under `scripts/fixtures/runtime-evidence-drift/`.
- Hardened `scripts/check-runtime-evidence-export.mjs` with structured JSON fixture validation for required runtime evidence view fields, blocked authority stop-lines, retained-evidence exclusions, runtime export route, verification command, and fixture family.
- Preserved the existing runtime-export check script and failure-collection style; no parallel drift-check framework, provider call, credential/session access, source mutation, launch retry automation, PR/merge/cleanup automation, failed-check bypass, real process launch, or broad autonomy was added.
- Updated story index and Story 9.1 implementation evidence.
- Resolved BMAD Party Mode/code-review findings by coupling fixture rules to live runtime export schema/service source surfaces, expanding negative fixture coverage, adding actionable fixture diagnostics, and aligning story index status wording.

### File List

- `docs/stories/9-1-harden-static-drift-checks.md`
- `docs/stories/index.md`
- `scripts/check-runtime-evidence-export.mjs`
- `scripts/fixtures/runtime-evidence-drift/known-good.json`
- `scripts/fixtures/runtime-evidence-drift/known-bad.json`

## Change Log

- 2026-06-13: Implemented fixture-backed runtime evidence static drift hardening and moved Story 9.1 to review.
- 2026-06-13: Resolved BMAD code-review findings and moved Story 9.1 to done.
