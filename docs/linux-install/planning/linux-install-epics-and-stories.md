---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-06-18/prd.md
  - _bmad-output/planning-artifacts/linux-install-architecture.md
---

# Kendall_Nxt - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Kendall_Nxt, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

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

### NonFunctional Requirements

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

### Additional Requirements

- Technical boundary: v1 mutation is limited to the local shell bootstrap path; SSH, Windows-to-Linux remote execution, staged scripts, provider login, browser auth automation, Tailscale enrollment, persistent service launch, reboot, and destructive cleanup are excluded.
- Entry points: `scripts/bootstrap-linux.sh --install-kendall-vnxt`, `pnpm run linux:bootstrap --plan`, `pnpm run linux:bootstrap --verify-only`, `scripts/validate-linux-install.sh --verify-only`, and `scripts/check-linux-bootstrap-evidence.mjs`.
- Implementation components: `scripts/linux-bootstrap.mjs`, `scripts/lib/linux-bootstrap/args.mjs`, `gates.mjs`, `executor.mjs`, `evidence.mjs`, and `tests/linux-bootstrap/*.test.mjs`.
- Gate architecture must preserve ordered local preflight, local identity, evidence path, base tools, repo state, install script, full verify, evidence write, and manual auth summary gates.
- Evidence architecture must store schema-compliant evidence under `docs/linux-install/evidence/`, avoid overwrites, and emit stdout evidence for pre-repo access blockers.
- Authority architecture must separate allowed unattended work from preauthorized host mutation, block-and-record operations, and forbidden secret/auth behavior.
- Autonomous goal runs must use `docs/linux-install/goal-run-contract.md` as the durable control plane for task state, command contracts, authority ledger, blocker packets, safe continuation, and completion semantics.
- Story execution must add release-gate traceability rows before execution, mapping task id, story, FRs, Linux acceptance criteria, authority class, command ids, expected evidence, and release gates.
- Include implementation work for public command/source reachability before the GitHub `main` command is treated as feature-complete.
- Include implementation work for first-install fresh Ubuntu 26.04+ evidence capture and validation.
- Include implementation work for idempotent rerun evidence capture and validation.
- Include implementation work for docs, troubleshooting, lessons learned, validation matrix, and release packaging refresh after real-host execution.
- Include code review and findings resolution before delivery.

### UX Design Requirements

No separate UX design document was found. Operator experience requirements are represented in the PRD and architecture requirements for terminal command behavior, readable plan and verify output, evidence receipts, recovery guidance, blocker packets, docs, and troubleshooting.

### FR Coverage Map

FR1: Epic 1 - Certified Ubuntu target definition.

FR2: Epic 1 - Single supported local install method.

FR3: Epic 1 - Root-user refusal before mutation.

FR4: Epic 1 - Unsupported OS/version refusal before mutation.

FR5: Epic 1 - Sudo capability gate.

FR6: Epic 1 - Local identity, host, disk, and DNS readiness gates.

FR7: Epic 1 - Non-mutating plan mode.

FR8: Epic 1 - Non-mutating verify-only mode.

FR9: Epic 1 - Shell bootstrap as the only mutating install path.

FR10: Epic 1 - Controller/verifier rejection of unsupported remote or staged arguments.

FR11: Epic 2 - Approved base tool install and verification.

FR12: Epic 2 - Existing versus installed/changed tool evidence.

FR13: Epic 2 - Repo clone when access is available and target is missing.

FR14: Epic 2 - Existing repo checkout and origin validation.

FR15: Epic 2 - Private repo access blocked state and recovery instructions.

FR16: Epic 2 - Project setup from validated repo checkout.

FR17: Epic 2 - Final Linux install validation after setup.

FR18: Epic 3 - Schema-compliant success, failure, and blocked evidence.

FR19: Epic 3 - Pre-repo blocked stdout evidence and stderr progress logging.

FR20: Epic 3 - Required evidence fields and result semantics.

FR21: Epic 3 - Evidence path containment and overwrite refusal.

FR22: Epic 3 - Auth and secret automation denylist.

FR23: Epic 3 - Manual post-deployment auth task summary.

FR24: Epic 2 - Idempotent install behavior across clean, partial, existing, rerun, and fail-closed states.

FR25: Epic 5 - Documentation separation between supported generic path and historical notes.

FR26: Epic 3 - Troubleshooting and lessons-learned feedback loop.

FR27: Epic 4 - Release gate traceability for requirements, commands, evidence, authority, and gates.

FR28: Epic 4 - Goal Run Contract state, authority, blocker, completion, and terminal delivery semantics.

FR29: Epic 4 - Bounded authority ledger enforcement.

FR30: Epic 4 - Blocker packets for missing authority and gated operations.

FR31: Epic 4 - Safe continuation after blockers.

FR32: Epic 4 - Evidence-derived completion report semantics.

FR33: Epic 4 - PR creation, merge, and workspace cleanup as terminal delivery activities.

FR34: Epic 5 - Published bootstrap source reachability before feature-complete claims.

FR35: Epic 5 - Fresh Ubuntu first-install evidence capture and validation.

FR36: Epic 5 - Idempotent rerun evidence capture and validation.

FR37: Epic 5 - Linux install docs package refresh only when release-ready.

FR38: Epic 5 - Final parser, gate, executor, evidence schema, auth denylist, docs, and Linux bootstrap checks before release.

FR39: Epic 5 - Code review before PR delivery.

## Epic List

### Epic 1: Certified Local Ubuntu Install Contract

Users and maintainers can understand and run only the supported Ubuntu 26.04+ local install path, with fail-closed preflight gates and no remote/staged install ambiguity.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10

### Epic 2: Bootstrap Execution And Repo Readiness

Users can reach a Kendall_Nxt-ready repo and toolchain state through the single bootstrap path, including approved tool setup, repo validation, project setup, verification, and safe reruns.

**FRs covered:** FR11, FR12, FR13, FR14, FR15, FR16, FR17, FR24

### Epic 3: Evidence, Recovery, And Auth Boundaries

Users receive trustworthy redacted pass, fail, or blocked evidence with recovery guidance, protected evidence paths, and explicit manual-auth boundaries.

**FRs covered:** FR18, FR19, FR20, FR21, FR22, FR23, FR26

### Epic 4: Autonomous Goal Run Governance

Codex `/goal` can safely continue non-gated Linux setup work using durable authority, command, blocker, traceability, safe-continuation, and completion contracts.

**FRs covered:** FR27, FR28, FR29, FR30, FR31, FR32, FR33

### Epic 5: Release Proof And Delivery Readiness

Maintainers can prove the published install path is reachable, fresh-host install and rerun evidence pass, docs and packaging are ready, final checks pass, and review is complete before PR delivery.

**FRs covered:** FR25, FR34, FR35, FR36, FR37, FR38, FR39

## Epic 1: Certified Local Ubuntu Install Contract

Users and maintainers can understand and run only the supported Ubuntu 26.04+ local install path, with fail-closed preflight gates and no remote/staged install ambiguity.

### Story 1.1: Declare Certified Ubuntu Target And Single Install Method

**Requirements:** FR1, FR2

As a Kendall_Nxt installer operator,
I want the docs and contract to identify Ubuntu 26.04+ local execution as the only supported v1 install path,
So that I do not follow stale SSH, remote, staged, or manual fallback instructions.

**Acceptance Criteria:**

**Given** the Linux install docs are reviewed
**When** the supported v1 install path is described
**Then** Ubuntu 26.04+ with an existing non-root sudo user is the certified target
**And** SSH, remote execution, staged scripts, Windows orchestration, and manual fallback paths are clearly excluded.

### Story 1.2: Enforce Local Identity And Platform Preflight Gates

**Requirements:** FR3, FR4, FR5, FR6

As a bootstrap operator,
I want the installer to fail closed before mutation on unsafe or unsupported hosts,
So that unsupported machines are not partially changed.

**Acceptance Criteria:**

**Given** the bootstrap is run on a host
**When** the current user is root, the OS is unsupported, Ubuntu is older than 26.04, sudo is unavailable, disk is insufficient, or GitHub DNS fails
**Then** the bootstrap exits before mutation
**And** the result includes a clear recovery summary.

### Story 1.3: Provide Non-Mutating Plan And Verify Modes

**Requirements:** FR7, FR8

As a maintainer,
I want plan and verify-only modes that do not mutate packages, repo state, services, providers, or cleanup targets,
So that readiness can be inspected before apply authority is used.

**Acceptance Criteria:**

**Given** the repo-owned controller is run with plan mode
**When** gates and manual steps are reported
**Then** no mutation occurs
**And** the output names stop lines and the single mutating bootstrap path.

**Given** verify-only mode is run
**When** readiness checks execute
**Then** no package, provider, service, repo-clone, or cleanup mutation occurs
**And** failures are reported as typed readiness results.

### Story 1.4: Reject Unsupported Remote And Apply Arguments

**Requirements:** FR10

As a maintainer,
I want the controller and verifier to reject arguments that imply remote, staged, or controller-driven apply behavior,
So that v1 keeps one supported local mutating path.

**Acceptance Criteria:**

**Given** a user passes unsupported arguments such as `--apply`, `--target`, or `--user` to the wrong entry point
**When** argument parsing runs
**Then** the command fails closed with usage guidance
**And** it does not start remote execution, staged orchestration, or mutation.

### Story 1.5: Enforce Shell Bootstrap As The Only Mutating Install Path

**Requirements:** FR9

As a release reviewer,
I want static and runtime checks proving `scripts/bootstrap-linux.sh --install-kendall-vnxt` is the only v1 mutating install command,
So that docs and code cannot drift into multiple install methods.

**Acceptance Criteria:**

**Given** Linux bootstrap checks run
**When** docs, scripts, and command references are scanned
**Then** only the shell bootstrap install mode is treated as mutating
**And** historical or lab-instance notes cannot override the single-method boundary.

## Epic 2: Bootstrap Execution And Repo Readiness

Users can reach a Kendall_Nxt-ready repo and toolchain state through the single bootstrap path, including approved tool setup, repo validation, project setup, verification, and safe reruns.

### Story 2.1: Install Or Verify Approved Base Toolchain

**Requirements:** FR11

As a bootstrap operator,
I want the installer to install or verify the approved base tools,
So that Kendall_Nxt has the required Linux development toolchain.

**Acceptance Criteria:**

**Given** the single bootstrap script runs with install authority
**When** required tools are missing or below policy
**Then** the script installs or reports the approved tool path for Node, pinned pnpm, uv, git, GitHub CLI, Codex CLI, Claude Code, and BMAD Method
**And** unsupported or unresolved tool states fail with recovery guidance.

### Story 2.2: Record Existing Versus Changed Tool State

**Requirements:** FR12

As a release reviewer,
I want evidence to distinguish pre-existing tools from installed or changed tools,
So that bootstrap impact is reviewable after a run.

**Acceptance Criteria:**

**Given** the bootstrap checks tool state
**When** a required tool is already present, installed, updated, skipped, or failed
**Then** the run records that status per tool
**And** the evidence does not imply mutation where none occurred.

### Story 2.3: Clone Or Validate Kendall_Nxt Repo State

**Requirements:** FR13, FR14

As a bootstrap operator,
I want the installer to clone the repo when allowed or validate an existing checkout,
So that setup runs only against the intended Kendall_Nxt repository.

**Acceptance Criteria:**

**Given** the target repo path is missing and repo access is available
**When** the bootstrap reaches repo setup
**Then** it clones the expected Kendall_Nxt repo.

**Given** the target path already exists
**When** repo validation runs
**Then** the path must be a Git checkout with an `origin` remote matching the expected repo URL
**And** mismatch or missing origin fails before setup.

### Story 2.4: Block Cleanly When Private Repo Access Is Missing

**Requirements:** FR15

As a bootstrap operator,
I want missing private GitHub access to produce a clear blocked result,
So that I can perform manual repo auth without the installer starting auth flows.

**Acceptance Criteria:**

**Given** repo access is required but unavailable
**When** clone or repo probe fails due to authentication/access
**Then** the bootstrap stops with manual repo-auth recovery instructions
**And** it does not start `gh auth login`, browser auth, device-code auth, token import, or credential helper mutation.

### Story 2.5: Run Project Setup And Final Verify From Validated Checkout

**Requirements:** FR16, FR17

As a maintainer,
I want setup and validation to run only after repo state is proven,
So that successful install evidence reflects a real Kendall_Nxt-ready checkout.

**Acceptance Criteria:**

**Given** the repo checkout passes validation
**When** bootstrap setup proceeds
**Then** project setup runs from that checkout
**And** `scripts/validate-linux-install.sh --verify-only` or equivalent final verification passes before success is reported.

### Story 2.6: Prove Safe Rerun Behavior Across Install States

**Requirements:** FR24

As a bootstrap operator,
I want reruns to resume safely or fail with exact recovery guidance,
So that interruption or prior success does not require destructive cleanup.

**Acceptance Criteria:**

**Given** the installer is rerun on clean, partial, existing-tool, existing-repo, successful, and unsupported states
**When** each run executes
**Then** it either completes idempotently or fails closed before unsafe mutation
**And** partial failure reports the failed gate and next safe recovery command.

## Epic 3: Evidence, Recovery, And Auth Boundaries

Users receive trustworthy redacted pass, fail, or blocked evidence with recovery guidance, protected evidence paths, and explicit manual-auth boundaries.

### Story 3.1: Write Schema-Compliant Success Failure And Blocked Evidence

**Requirements:** FR18, FR20

As a release reviewer,
I want every eligible bootstrap outcome to produce schema-compliant evidence,
So that pass, fail, and blocked results can be audited without relying on chat history.

**Acceptance Criteria:**

**Given** the approved repo evidence directory is known
**When** bootstrap exits with pass, fail, or blocked status
**Then** it writes evidence that validates against `docs/linux-install/evidence/schema.md`
**And** the evidence records the result and recovery path for the outcome.

### Story 3.2: Emit Pre-Repo Blocked Evidence Safely

**Requirements:** FR19

As a bootstrap operator,
I want repo-access blockers before checkout availability to produce parseable stdout evidence,
So that private repo access failures still leave a usable recovery packet.

**Acceptance Criteria:**

**Given** repo access is blocked before an approved evidence directory exists
**When** the bootstrap exits
**Then** stdout contains schema-compliant blocked evidence
**And** progress logs are written to stderr so stdout remains parseable.

### Story 3.3: Enforce Evidence Redaction And Required Fields

**Requirements:** FR20

As a reviewer,
I want evidence to include the required operational fields while excluding secrets,
So that install proof is useful and safe to retain.

**Acceptance Criteria:**

**Given** evidence is generated
**When** validation runs
**Then** it includes command mode, redacted command summary, local identity, OS/version, architecture, repo path, repo state, gate outcomes, tool versions, manual auth tasks, auth-boundary proof, result, rerun guidance, and recovery instructions
**And** it excludes secrets, raw credential output, auth URLs, device codes, token values, credential helper output, shell history, broad environment dumps, private keys, and broad home-directory listings.

### Story 3.4: Protect Evidence Paths From Unsafe Writes

**Requirements:** FR21

As a maintainer,
I want evidence writes to stay inside approved repo paths and avoid overwrites,
So that install proof cannot clobber or leak into arbitrary filesystem locations.

**Acceptance Criteria:**

**Given** an evidence path is requested
**When** evidence-path validation runs
**Then** paths outside `docs/linux-install/evidence/` are rejected before verification work proceeds
**And** existing evidence files are not overwritten.

### Story 3.5: Deny Automated Auth And Secret Handling

**Requirements:** FR22, FR23

As an installer operator,
I want the bootstrap to identify manual auth tasks without performing them,
So that credentials and provider accounts stay under user control.

**Acceptance Criteria:**

**Given** GitHub, Codex, Claude, Tailscale, or provider auth is absent
**When** the bootstrap summarizes auth readiness
**Then** it lists manual post-deployment tasks where relevant
**And** it never runs login flows, browser/device-code auth, token writes, credential helper mutation, provider calls, or private key handling.

### Story 3.6: Keep Troubleshooting And Lessons Learned Current

**Requirements:** FR26

As a future installer operator,
I want failed assumptions and recovery steps captured in docs,
So that repeated Linux install failures are not rediscovered from chat history.

**Acceptance Criteria:**

**Given** an install command, assumption, or user step fails during Linux setup work
**When** the work pass is completed
**Then** `docs/linux-install/troubleshooting.md`, `docs/linux-install/lessons-learned.md`, or the relevant playbook section is updated
**And** the update points to the evidence or command family that justified the change.

## Epic 4: Autonomous Goal Run Governance

Codex `/goal` can safely continue non-gated Linux setup work using durable authority, command, blocker, traceability, safe-continuation, and completion contracts.

### Story 4.1: Map Stories To Release Gates Before Execution

**Requirements:** FR27

As a maintainer,
I want every implementation story mapped to requirements, command ids, authority, evidence, and release gates before execution,
So that autonomous work cannot drift away from the Linux setup PRD.

**Acceptance Criteria:**

**Given** a Linux setup implementation story is prepared
**When** it becomes execution-ready
**Then** `docs/linux-install/release-gate-traceability.md` includes rows for task id, story, FRs, Linux acceptance criteria, authority class, command ids, expected evidence, and release gates
**And** unmapped FRs or gates block completion claims.

### Story 4.2: Define Durable Goal Run Task State And Command Contracts

**Requirements:** FR28

As a Codex `/goal` operator,
I want each autonomous task to have explicit state and bounded command contracts,
So that long-running Linux setup work can resume safely after interruptions.

**Acceptance Criteria:**

**Given** a goal-run task is defined
**When** it is selected for execution
**Then** it has state, mapped requirements, dependencies, authority class, allowed mode, last command, next command, evidence paths, completion condition, blocked condition, and resume command
**And** each runnable command defines purpose, working directory, argv, timeout, authority requirement, allowed write paths, evidence output, structured exit behavior, and failure type.

### Story 4.3: Enforce Bounded Authority Ledger Decisions

**Requirements:** FR29

As Bob,
I want generic approval language rejected and bounded authority entries accepted only when they match the task,
So that autonomous setup cannot expand into unsafe mutation.

**Acceptance Criteria:**

**Given** a task requires preauthorization
**When** the authority ledger is evaluated
**Then** broad phrases such as "continue" or "do whatever is needed" are rejected
**And** only entries naming authority family, operation, scope, command ids, targets, impact, evidence, recovery, approval reference, and stop lines can authorize the task.

### Story 4.4: Record Blocker Packets For Gated Operations

**Requirements:** FR30

As a goal-run reviewer,
I want missing authority and manual external actions recorded as blocker packets,
So that the exact resume point and required Bob action are preserved.

**Acceptance Criteria:**

**Given** a task reaches manual auth, paid provider usage, external enrollment, destructive cleanup, reboot, PR creation, merge, or workspace cleanup without matching authority
**When** the goal run handles the blocker
**Then** it writes a blocker packet with blocked operation, reason, last safe command, proposed next command, required Bob action, resume command, dependency impact, safe tasks still attempted, and secrets exclusion
**And** no gated action is simulated as complete.

### Story 4.5: Apply Safe Continuation After Blockers

**Requirements:** FR31

As a Codex `/goal` operator,
I want independent safe work to continue while dependent work stays blocked,
So that missing authority pauses only the affected lane.

**Acceptance Criteria:**

**Given** a task is blocked by missing authority or manual external action
**When** the run evaluates remaining tasks
**Then** only tasks with independent inputs, dependencies, authority, and outputs continue
**And** dependent tasks are marked dependency-blocked instead of skipped or completed.

### Story 4.6: Generate Completion Reports From Evidence

**Requirements:** FR32, FR33

As a reviewer,
I want completion status derived from task state, release gates, and evidence,
So that incomplete Linux setup work cannot be reported as done.

**Acceptance Criteria:**

**Given** a completion report is generated
**When** any mapped acceptance criterion, required verification, required evidence, release gate, or blocker remains open
**Then** the report cannot claim complete
**And** PR creation, merge, and workspace cleanup remain terminal delivery operations requiring separate matching authority.

## Epic 5: Release Proof And Delivery Readiness

Maintainers can prove the published install path is reachable, fresh-host install and rerun evidence pass, docs and packaging are ready, final checks pass, and review is complete before PR delivery.

### Story 5.1: Separate Supported Install Docs From Historical Notes

**Requirements:** FR25

As a future installer operator,
I want the generic install path separated from historical or lab-specific notes,
So that old SSH, remote, or staged instructions do not override the supported v1 boundary.

**Acceptance Criteria:**

**Given** the Linux install documentation is scanned
**When** supported install instructions are presented
**Then** the generic path points to the single local bootstrap method
**And** historical implementation plans, remote templates, SSH policies, lab host notes, and platform evaluation notes are labeled as non-authoritative for v1 install.

### Story 5.2: Prove Published Bootstrap Source Reachability

**Requirements:** FR34

As a release reviewer,
I want the documented bootstrap source to be reachable by the intended installer audience,
So that the published command is not claimed feature-complete before it can be downloaded.

**Acceptance Criteria:**

**Given** the GitHub `main` raw bootstrap URL or alternate public source is documented
**When** the URL reachability check runs
**Then** it passes for the intended installer audience before the command is called feature-complete
**And** pre-merge branch or workspace evidence is labeled as pre-merge evidence only.

### Story 5.3: Capture Fresh Ubuntu First-Install Evidence

**Requirements:** FR35

As a maintainer,
I want a fresh or reset Ubuntu 26.04+ host to run the single bootstrap path successfully,
So that release readiness is backed by real host proof.

**Acceptance Criteria:**

**Given** a fresh or reset Ubuntu 26.04-or-later host exists with a non-root sudo user
**When** the approved single bootstrap command runs locally on that host
**Then** it completes or fails with schema-compliant evidence
**And** successful release proof requires validated first-install pass evidence.

### Story 5.4: Capture Idempotent Rerun Evidence

**Requirements:** FR36

As a release reviewer,
I want the same host rerun after success to prove idempotency,
So that the installer can be safely repeated after initial setup.

**Acceptance Criteria:**

**Given** first-install evidence has passed on the target host
**When** the single bootstrap command is rerun locally
**Then** it exits cleanly without destructive changes
**And** validated rerun evidence proves idempotency.

### Story 5.5: Refresh Release Docs And Linux Install Package

**Requirements:** FR37

As a maintainer,
I want release docs and packaged Linux install materials refreshed only after implementation evidence is ready,
So that distributed artifacts match the proven install path.

**Acceptance Criteria:**

**Given** implementation, evidence, troubleshooting, lessons learned, and validation matrix updates are complete
**When** the Linux install docs package is refreshed
**Then** it includes the current supported install materials
**And** it is not refreshed as a substitute for missing release evidence.

### Story 5.6: Run Final Verification And Code Review Before Delivery

**Requirements:** FR38, FR39

As a release reviewer,
I want final checks and code review completed before PR delivery,
So that Linux install MVP delivery is based on verified behavior and reviewed changes.

**Acceptance Criteria:**

**Given** the release candidate is ready
**When** final verification runs
**Then** targeted parser, gate, executor, evidence schema, auth denylist, docs, Linux bootstrap checks, and any story-specific checks pass or are explicitly blocked with evidence
**And** code review findings are resolved or intentionally deferred before PR creation.
