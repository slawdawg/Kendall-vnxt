---
title: Kendall_Nxt Linux Install MVP PRD
status: draft
created: 2026-06-18
updated: 2026-06-18
source_recovery:
  - docs/linux-install/index.md
  - docs/linux-install/install-contract.md
  - docs/linux-install/one-command-bootstrap-plan.md
  - docs/linux-install/validation-matrix.md
  - docs/linux-install/goal-run-contract.md
  - docs/linux-install/release-gate-traceability.md
  - docs/linux-install/remaining-gaps.md
---

# Kendall_Nxt Linux Install MVP PRD

## Purpose

Create a repeatable, validated Kendall_Nxt deployment path for Ubuntu 26.04 or later. A user logs in to an existing Ubuntu session as a non-root sudo-capable Linux user, runs the supported local bootstrap command, and receives an evidence-backed result without moving secrets or relying on chat history.

## Product Boundary

Version 1 supports only local in-distro execution on Ubuntu 26.04 or later. The bootstrap may install approved tools, clone or validate the Kendall_Nxt repo, run setup and verification, and write redacted evidence. It must not create machines, create Linux users, automate SSH orchestration, run staged remote scripts, perform provider login, start persistent workers, reboot, or perform cleanup without separate explicit authority.

## Users And Operators

- Primary operator: Bob or a future Kendall_Nxt maintainer running setup from an Ubuntu terminal.
- Autonomous implementer: Codex `/goal` working from durable repo artifacts, implementation stories, and authority/evidence contracts.
- Reviewer: Bob or a code reviewer validating that installer behavior, docs, evidence, and release gates match the product boundary.

## Success Metrics

- A fresh Ubuntu 26.04-or-later host completes the single bootstrap path and produces schema-compliant pass evidence.
- A rerun after success exits cleanly and produces idempotency evidence.
- Unsupported hosts and missing authority fail closed before mutation.
- Provider and service auth remain manual post-deployment actions and are not treated as base bootstrap failures.
- Every Linux setup acceptance item maps to a release gate, command contract, and evidence requirement before autonomous implementation runs.

Counter-metric: a "successful" install that depends on undocumented manual package, auth, repo, or provider steps does not count as success.

## Functional Requirements

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

## Non-Functional Requirements

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

## Current Evidence And Progress

- `scripts/bootstrap-linux.sh --install-kendall-vnxt` exists as the single local install script mode.
- Internal Linux bootstrap modules exist under `scripts/lib/linux-bootstrap/`.
- The controller rejects remote/staged arguments and derives local identity from the current Ubuntu session.
- The Node verifier rejects unsupported apply/target/user arguments.
- Local identity checks cover root refusal, Ubuntu 26.04+, sudo, disk, and GitHub DNS readiness.
- `pnpm run check:linux-bootstrap` covers syntax, contract, evidence schema, helper checker, shell syntax, and tests.
- Evidence collision handling, failure evidence, pre-repo blocked stdout evidence, stderr progress logging, idempotent CLI install checks, and pinned pnpm rerun behavior are implemented or documented as current progress.
- Current known gap: `pnpm run check:linux-bootstrap-url` fails against the raw GitHub `main` bootstrap URL until publication or equivalent source reachability is resolved.

## Open Questions And Assumptions

- [ASSUMPTION] The recovered PRD should treat the current single-command local Ubuntu installer as the product slice, not the older SSH or staged install material.
- [ASSUMPTION] There is no separate UX spec for this slice; operator UX is command output, docs, evidence receipts, and recovery/blocker packets.
- [ASSUMPTION] The current implementation progress in `docs/linux-install/one-command-bootstrap-plan.md` is authoritative unless Bob excludes it.
- [OPEN] Confirm whether the epic/story workflow should include historical docs such as `implementation-plan.md`, `remote-approval-template.md`, and `ssh-key-policy.md` only as exclusions/history, or ignore them entirely.
- [OPEN] Confirm whether story creation should target the remaining feature-complete work only, or also create retrospective stories for already-implemented Linux bootstrap work.

