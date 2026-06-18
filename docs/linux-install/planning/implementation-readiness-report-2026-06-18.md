---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
includedDocuments:
  prd:
    - docs/prds/linux-install-mvp.md
  architecture:
    - docs/linux-install/planning/linux-install-architecture-input.md
  epics:
    - docs/linux-install/planning/linux-install-epics-and-stories.md
  ux: []
sourceOfTruth:
  - tracked docs under docs/
provenanceOnly:
  - _bmad-output/planning-artifacts/
---

# Implementation Readiness Assessment Report

**Date:** 2026-06-18
**Project:** Kendall_Nxt

## Document Discovery

### PRD Files Found

**Whole Documents:**
- `docs/prds/linux-install-mvp.md`

**Sharded Documents:**
- None selected.

### Architecture Files Found

**Whole Documents:**
- `docs/linux-install/planning/linux-install-architecture-input.md`

**Sharded Documents:**
- None selected.

### Epics And Stories Files Found

**Whole Documents:**
- `docs/linux-install/planning/linux-install-epics-and-stories.md`

**Sharded Documents:**
- None selected.

### UX Design Files Found

**Whole Documents:**
- None found.

**Sharded Documents:**
- None found.

### Issues Found

- No selected whole-vs-sharded document conflicts.
- `_bmad-output/planning-artifacts/` contains recovered provenance copies, but
  the combined lane designates tracked `docs/` artifacts as the source of truth.
- UX design document not found. Assessment treats terminal output,
  documentation, evidence receipts, recovery guidance, and blocker packets as
  UX requirements already captured in PRD and architecture inputs.

### Selected Documents For Assessment

- PRD: `docs/prds/linux-install-mvp.md`
- Architecture: `docs/linux-install/planning/linux-install-architecture-input.md`
- Epics and stories: `docs/linux-install/planning/linux-install-epics-and-stories.md`
- UX: none

## PRD Analysis

### Functional Requirements

FR1: The product must define Ubuntu 26.04 LTS or later as the first certified Linux target and must avoid overclaiming support for other distributions.

FR2: The product must support exactly one v1 install method: a local Linux user runs the single Kendall_Nxt bootstrap command or script from inside the Ubuntu session.

FR3: The bootstrap must refuse to run as `root` before performing mutation.

FR4: The bootstrap must refuse unsupported operating systems and Ubuntu versions older than 26.04 before performing mutation.

FR5: The bootstrap must verify that the current user has sudo capability before install work proceeds.

FR6: The bootstrap must verify local identity, hostname, architecture, home directory, free disk space, and `github.com` DNS readiness before install work proceeds.

FR7: The bootstrap must provide a non-mutating plan mode that prints planned gates, auth boundaries, stop lines, and manual next steps.

FR8: The bootstrap must provide a verify-only mode that checks local readiness without package, repo, provider, service, or cleanup mutation.

FR9: The shell bootstrap script mode `--install-kendall-vnxt` must be the only mutating install command for v1.

FR10: The repo-owned controller and verifier must reject unsupported remote or staged install arguments, including `--apply`, `--target`, and `--user` where they would imply a non-local method.

FR11: The bootstrap must install or verify approved base tools needed by Kendall_Nxt, including Node, pinned pnpm, uv, git, GitHub CLI, Codex CLI, Claude Code, and BMAD Method.

FR12: The bootstrap must distinguish tools that were already present from tools it installed or changed.

FR13: The bootstrap must clone the Kendall_Nxt repo when repo access is already available and the target path is missing.

FR14: The bootstrap must validate an existing repo path as a Git checkout with an `origin` remote matching the expected Kendall_Nxt repo URL before setup or final validation is considered successful.

FR15: If private GitHub repository access is unavailable, the bootstrap must stop with manual repo-auth recovery instructions instead of initiating authentication.

FR16: The bootstrap must run project setup from the validated repo checkout.

FR17: The bootstrap must run the Linux install validation script in verify-only mode after setup.

FR18: The bootstrap must write schema-compliant success, failure, or blocked evidence once the approved repo evidence destination is known.

FR19: When repo access is blocked before a repo evidence directory exists, the bootstrap must emit schema-compliant blocked stdout evidence and keep progress logs on stderr.

FR20: Evidence must include command mode, redacted command summary, local identity, OS/version, architecture, repo path, repo state, gate outcomes, tool versions, manual auth tasks, auth-boundary proof, result, rerun guidance, and recovery instructions.

FR21: Evidence paths must stay under `docs/linux-install/evidence/` and must not overwrite existing packets.

FR22: The bootstrap must never automate GitHub auth login, Codex login, Claude auth, Tailscale login, provider auth, browser login flows, token writes, credential helper mutation, or private key handling.

FR23: The bootstrap must list post-deployment manual auth tasks without executing them.

FR24: The install path must be idempotent for clean hosts, partially installed hosts, existing toolchains, existing repo checkouts, successful reruns, and fail-closed unsupported states.

FR25: The docs must separate the generic supported install path from historical, lab-instance, SSH, or platform-evaluation notes.

FR26: The docs must include troubleshooting and lessons-learned feedback so repeated install failures do not remain only in chat history.

FR27: The release gate traceability must map Linux setup requirements to command ids, evidence, authority class, and release gates before execution.

FR28: The Goal Run Contract must define task state, authority classes, command contracts, safe continuation, blocker packets, completion semantics, and terminal delivery rules for autonomous implementation.

FR29: Autonomous `/goal` runs must reject generic approval language as preauthorization and accept only bounded authority ledger entries.

FR30: Autonomous `/goal` runs must record blocker packets for manual auth, paid provider usage, external enrollment, destructive cleanup, reboot, and other missing authority boundaries.

FR31: Autonomous `/goal` runs may continue only independent safe tasks after a blocker and must preserve dependency-blocked tasks as blocked rather than simulated complete.

FR32: Completion reports must be generated from state and evidence and must not report complete while required evidence, release gates, or blockers remain open.

FR33: PR creation, merge, and workspace cleanup must be treated as terminal delivery activities requiring separate matching authority.

FR34: The implementation must prove the documented bootstrap URL or alternate published source is reachable by the intended installer audience before the GitHub `main` command is called feature-complete.

FR35: The implementation must capture and validate first-install evidence from a fresh or reset Ubuntu 26.04-or-later host.

FR36: The implementation must capture and validate rerun evidence proving idempotency on the same host.

FR37: The implementation must refresh the Linux install docs package only when implementation and release evidence are ready for PR.

FR38: The implementation must pass targeted parser, gate, executor, evidence schema, auth denylist, docs, and Linux bootstrap checks before release.

FR39: The implementation must receive code review before PR delivery.

Total FRs: 39

### Non-Functional Requirements

NFR1: Safety gates must fail closed before unsafe or unauthorized mutation.

NFR2: The v1 experience must be local-first and understandable to a non-Bob operator using an Ubuntu terminal.

NFR3: Evidence must be redacted and must exclude secrets, raw credential output, auth URLs, device codes, token values, credential helper output, shell history, broad environment dumps, private keys, and broad home-directory listings.

NFR4: Command behavior must be bounded, typed on failure, timeout-scoped where applicable, and non-interactive for autonomous story execution.

NFR5: Recovery guidance must prefer safe rerun over destructive rollback.

NFR6: The implementation must preserve reviewable diffs and avoid repo-wide churn unrelated to the Linux install MVP.

NFR7: Publication claims must be evidence-backed; pre-merge workspace or branch proof must not be represented as published `main` proof.

NFR8: Provider, Tailnet, GitHub service, Codex, Claude, and paid usage boundaries must remain explicit manual or authority-gated steps.

NFR9: Supply-chain claims must not exceed the evidence available for package sources, version pinning, and installer provenance.

NFR10: Documentation must keep one source of truth for the supported install method and must not reintroduce SSH, remote execution, or manual fallback paths as supported v1 methods.

Total NFRs: 10

### Additional Requirements

- Product boundary: local in-distro Ubuntu execution only; no machine creation, Linux user creation, SSH orchestration, staged remote scripts, provider login, persistent worker launch, reboot, or cleanup without separate authority.
- Success metrics require fresh Ubuntu install evidence, idempotent rerun evidence, fail-closed unsupported states, manual provider/service auth, and release-gate traceability.
- Current known gap: the raw GitHub `main` bootstrap URL is not yet proven reachable, so published-command feature completeness is not established.
- Open assumptions remain around historical docs treatment and whether story execution should cover remaining work only or also retrospective already-implemented work.

### PRD Completeness Assessment

The PRD is complete enough for implementation-readiness validation. It has stable FR and NFR identifiers, a clear v1 product boundary, success and counter metrics, current evidence, known gaps, and explicit open assumptions. The remaining open assumptions do not block readiness evaluation because the promoted epics target the supported single-command local Ubuntu installer and preserve historical docs as non-authoritative context.

## Epic Coverage Validation

### Epic FR Coverage Extracted

The epics and stories document includes an explicit "FR Coverage Map" and Epic List:

- Epic 1 covers FR1-FR10.
- Epic 2 covers FR11-FR17 and FR24.
- Epic 3 covers FR18-FR23 and FR26.
- Epic 4 covers FR27-FR33.
- Epic 5 covers FR25 and FR34-FR39.

### Coverage Matrix

| FR Number | Epic Coverage | Status |
| --- | --- | --- |
| FR1 | Epic 1 - Certified Ubuntu target definition | Covered |
| FR2 | Epic 1 - Single supported local install method | Covered |
| FR3 | Epic 1 - Root-user refusal before mutation | Covered |
| FR4 | Epic 1 - Unsupported OS/version refusal before mutation | Covered |
| FR5 | Epic 1 - Sudo capability gate | Covered |
| FR6 | Epic 1 - Local identity, host, disk, and DNS readiness gates | Covered |
| FR7 | Epic 1 - Non-mutating plan mode | Covered |
| FR8 | Epic 1 - Non-mutating verify-only mode | Covered |
| FR9 | Epic 1 - Shell bootstrap as the only mutating install path | Covered |
| FR10 | Epic 1 - Controller/verifier rejection of unsupported remote or staged arguments | Covered |
| FR11 | Epic 2 - Approved base tool install and verification | Covered |
| FR12 | Epic 2 - Existing versus installed/changed tool evidence | Covered |
| FR13 | Epic 2 - Repo clone when access is available and target is missing | Covered |
| FR14 | Epic 2 - Existing repo checkout and origin validation | Covered |
| FR15 | Epic 2 - Private repo access blocked state and recovery instructions | Covered |
| FR16 | Epic 2 - Project setup from validated repo checkout | Covered |
| FR17 | Epic 2 - Final Linux install validation after setup | Covered |
| FR18 | Epic 3 - Schema-compliant success, failure, and blocked evidence | Covered |
| FR19 | Epic 3 - Pre-repo blocked stdout evidence and stderr progress logging | Covered |
| FR20 | Epic 3 - Required evidence fields and result semantics | Covered |
| FR21 | Epic 3 - Evidence path containment and overwrite refusal | Covered |
| FR22 | Epic 3 - Auth and secret automation denylist | Covered |
| FR23 | Epic 3 - Manual post-deployment auth task summary | Covered |
| FR24 | Epic 2 - Idempotent install behavior across clean, partial, existing, rerun, and fail-closed states | Covered |
| FR25 | Epic 5 - Documentation separation between supported generic path and historical notes | Covered |
| FR26 | Epic 3 - Troubleshooting and lessons-learned feedback loop | Covered |
| FR27 | Epic 4 - Release gate traceability for requirements, commands, evidence, authority, and gates | Covered |
| FR28 | Epic 4 - Goal Run Contract state, authority, blocker, completion, and terminal delivery semantics | Covered |
| FR29 | Epic 4 - Bounded authority ledger enforcement | Covered |
| FR30 | Epic 4 - Blocker packets for missing authority and gated operations | Covered |
| FR31 | Epic 4 - Safe continuation after blockers | Covered |
| FR32 | Epic 4 - Evidence-derived completion report semantics | Covered |
| FR33 | Epic 4 - PR creation, merge, and workspace cleanup as terminal delivery activities | Covered |
| FR34 | Epic 5 - Published bootstrap source reachability before feature-complete claims | Covered |
| FR35 | Epic 5 - Fresh Ubuntu first-install evidence capture and validation | Covered |
| FR36 | Epic 5 - Idempotent rerun evidence capture and validation | Covered |
| FR37 | Epic 5 - Linux install docs package refresh only when release-ready | Covered |
| FR38 | Epic 5 - Final parser, gate, executor, evidence schema, auth denylist, docs, and Linux bootstrap checks before release | Covered |
| FR39 | Epic 5 - Code review before PR delivery | Covered |

### Missing Requirements

No missing FR coverage found.

### Coverage Statistics

- Total PRD FRs: 39
- FRs covered in epics: 39
- Coverage percentage: 100%

## UX Alignment Assessment

### UX Document Status

No standalone UX document found or selected.

### Alignment Issues

No blocking UX-to-PRD or UX-to-architecture misalignment found. The lane is a
local command-line installer, not a web/mobile UI feature. Operator experience
is represented in the PRD, architecture input, and stories through:

- non-mutating plan and verify modes,
- readable terminal gate summaries,
- redacted evidence receipts,
- manual-auth task summaries,
- typed blocker packets,
- troubleshooting and lessons-learned docs,
- recovery guidance that prefers safe rerun over destructive rollback.

### Warnings

- Warning: no dedicated UX artifact exists. This is acceptable for the current
  command-line installer lane if future stories continue to treat terminal
  output, docs, evidence receipts, blocker packets, and recovery text as the UX
  surface.
- If the lane later adds dashboard, browser, or multi-user UI surfaces, create a
  dedicated UX spec before implementation.

## Epic Quality Review

### Epic Structure Validation

| Epic | User Value Focus | Independence | Result |
| --- | --- | --- | --- |
| Epic 1: Certified Local Ubuntu Install Contract | Operator and maintainer can understand and run only the supported local Ubuntu path. | Can stand alone as contract/preflight foundation. | Pass |
| Epic 2: Bootstrap Execution And Repo Readiness | Operator reaches a usable Kendall_Nxt repo/toolchain state through the single bootstrap path. | Builds on Epic 1 contract/preflight outputs. | Pass |
| Epic 3: Evidence, Recovery, And Auth Boundaries | Operator/reviewer receives safe evidence, recovery guidance, and manual-auth boundaries. | Can build on Epic 1 and Epic 2 outcomes; some evidence behaviors may be developed alongside Epic 2 but do not require future Epic 4/5. | Pass |
| Epic 4: Autonomous Goal Run Governance | Bob/Codex can safely continue non-gated work with durable authority and blocker contracts. | Builds on PRD/release-gate traceability and does not require Epic 5 release proof. | Pass |
| Epic 5: Release Proof And Delivery Readiness | Maintainers can prove the published install path and deliver after checks/review. | Correctly depends on implementation/evidence from prior epics. | Pass |

No epic is merely a technical component such as "database setup" or "API work."
Each epic names an operator, maintainer, reviewer, or autonomous-runner outcome.

### Story Quality Assessment

The story list is coherent and traceable, but it is still an epic-level
breakdown rather than a set of execution-ready BMAD story files.

Strengths:

- Stories use user-value phrasing and map back to FRs.
- Acceptance criteria are written in Given/When/Then style.
- No forward dependency references were found.
- Release, authority, evidence, and review boundaries are preserved.

Major issue:

- The stories are not yet detailed implementation packets. They lack individual
  story files with full context, file targets, dependencies, dev notes,
  verification commands, traceability rows to update, and done criteria. This is
  acceptable for epic planning, but it blocks direct developer execution.

Minor concerns:

- Several stories have one broad acceptance scenario only. Before execution,
  story creation should add negative/error cases for unsupported OS, missing
  sudo, blocked repo auth, evidence collision, stale URL/source reachability,
  and authority-denied operations where relevant.
- Epic 3 and Epic 2 have natural overlap around evidence written during install
  execution. Individual stories should name ownership clearly so evidence
  schema/validator work does not duplicate bootstrap execution work.
- Epic 4 governance stories are policy/contract heavy. Execution stories should
  include exact fixture and drift-check updates, not only prose acceptance.

### Dependency Analysis

- No circular dependencies found.
- No story explicitly depends on a later story.
- Epic 5 correctly depends on earlier implementation and evidence proof.
- Epic 4 terminal delivery story correctly preserves PR creation, merge, and
  cleanup as gated delivery activities rather than routine development steps.

### Best Practices Compliance Checklist

| Check | Result |
| --- | --- |
| Epics deliver user value | Pass |
| Epics can function in order without forward dependencies | Pass |
| Stories are appropriately sized for planning | Pass |
| Stories are execution-ready without further story-file creation | Major issue |
| Given/When/Then acceptance criteria present | Pass |
| Error and edge cases complete for every story | Minor concern |
| Traceability to FRs maintained | Pass |

### Recommendations

1. Run `bmad-create-story` for the next executable story before implementation.
2. Add story-specific context, target files, verification commands, release-gate
   traceability updates, and evidence expectations to each generated story file.
3. For each implementation story, add negative/error acceptance coverage where
   the epic-level story only has broad happy-path criteria.
4. Keep Epic 5 stories until after implementation evidence exists; do not use
   release packaging work to substitute for missing first-install or rerun proof.

## Summary and Recommendations

### Overall Readiness Status

NEEDS WORK.

The combined Linux Install MVP lane is ready for the next BMAD workflow step,
but not ready for direct implementation from the epic-level artifact alone. The
PRD, architecture input, and epics/stories are aligned, but execution should
begin only after the next BMAD story file is created with full implementation
context.

### Critical Issues Requiring Immediate Action

No critical FR coverage gaps were found.

### Major Issues Requiring Action Before Implementation

1. Individual execution-ready BMAD story files do not yet exist for this lane.
   The epic/story breakdown is sufficient for planning, but it does not provide
   the full implementation context expected by the developer workflow.

### Warnings And Minor Concerns

1. No standalone UX document exists. This is acceptable for the command-line
   installer lane, but terminal output, docs, evidence receipts, blocker
   packets, and recovery text must continue to be treated as UX surfaces.
2. Several stories need richer negative/error acceptance criteria before
   execution.
3. Epic 2 and Epic 3 overlap around install evidence. Individual story files
   must clarify ownership to avoid duplicate implementation.
4. Release proof and packaging stories must remain blocked until real
   first-install and rerun evidence exists.

### Recommended Next Steps

1. Run `bmad-create-story` for the first executable Linux Install MVP story.
2. Use `docs/linux-install/planning/linux-install-epics-and-stories.md` as the
   source epic/story list and create a tracked story file under the repo's
   normal story location.
3. Add story-specific implementation context: target files, release-gate rows,
   command contracts, evidence expectations, verification commands, stop lines,
   and negative acceptance cases.
4. Implement one story at a time, updating `docs/linux-install/planning/lane-status.md`
   after each meaningful step.
5. Run focused checks after each story:
   - `node ./scripts/check-linux-install-lane.mjs`
   - `node ./scripts/check-doc-indexes.mjs`
   - `node ./scripts/check-linux-bootstrap.mjs`
   - `node ./scripts/check-linux-bootstrap-evidence.mjs <evidence>`
6. Run BMAD code review and party-mode review before PR creation.

### Final Note

This assessment found one major issue and four warning/minor concerns across
readiness, UX, story quality, and release-proof categories. The right next step
is not implementation yet; it is creating the next execution-ready BMAD story
from the recovered epic/story breakdown.

Assessor: Codex using `bmad-check-implementation-readiness`
