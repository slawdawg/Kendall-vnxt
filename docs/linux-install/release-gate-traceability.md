# Kendall_Nxt Linux Setup Release Gate Traceability

Status: draft v1

This matrix maps the Linux Setup PRD requirements to verification evidence.
Rows marked draft must be completed before the Linux Setup MVP can be called
implementation-ready for autonomous `/goal` execution.

## Gate Matrix

| Gate id | Requirement | Proof command or artifact | Required evidence | Status |
| --- | --- | --- | --- | --- |
| LG-01 | README explains Kendall_Nxt, capabilities, support status, and doctor-first setup path. | `pnpm linux:drift` | Drift report showing README section/order checks pass. | Draft |
| LG-02 | Ubuntu 26.04 is the first Certified Target and other distros are not overclaimed. | `pnpm linux:drift` | Support-tier check and docs scan. | Draft |
| LG-03 | Public command surface is `pnpm linux:setup`, `pnpm linux:doctor`, `pnpm linux:smoke`, `pnpm linux:drift`. | `pnpm linux:drift` | Command reference check. | Draft |
| LG-04 | `pnpm linux:doctor` is first advertised and non-mutating. | `pnpm linux:doctor` plus drift check | Doctor evidence with no mutations. | Draft |
| LG-05 | `pnpm linux:setup` supports inspect, plan, preview, confirm, apply, verify, evidence. | setup dry-run fixture | Setup preview evidence and command contract. | Draft |
| LG-06 | Manual Auth is user-operated only. | auth negative fixtures | No automated login; handoff packet examples pass redaction. | Draft |
| LG-07 | Evidence Receipt is redacted and includes result, next action, and artifact path. | evidence validator | Evidence schema validation and seeded-secret scan. | Draft |
| LG-08 | Unsupported distro blocks mutation. | OS fixture tests | Unsupported distro evidence with no writes. | Draft |
| LG-09 | Goal Run Contract exists and is referenced by stories. | `docs/linux-install/goal-run-contract.md` | Contract review plus story references. | Static check wired |
| LG-10 | Authority Ledger rejects broad approval and accepts only bounded matching authority. | preauthorization fixtures | Invalid and valid fixture results. | Static check wired |
| LG-11 | Blocker Packet records gated operations and exact resume points. | blocker fixtures | Manual Auth, paid provider, destructive mutation, Tailnet examples. | Static check wired |
| LG-12 | Safe continuation is deterministic after a blocker. | task-graph fixture | Independent task continues; dependent/gated tasks pause. | Static check wired |
| LG-13 | Completion cannot report complete with missing required evidence. | missing-evidence fixture | Completion report rejected. | Static check wired |
| LG-14 | Commands are bounded and non-interactive. | command contract tests | Timeout, no-stdin, typed failure, allowed-write-path checks. | Static check wired |
| LG-15 | Fresh Ubuntu 26.04 setup passes twice and interruption recovery is proven. | fresh-host run evidence | Clean run, idempotent rerun, interruption-recovery run. | Draft |
| LG-16 | PR creation, merge, and cleanup are final delivery operations. | Goal Run Contract and delivery checklist | No intermediate PR/merge/cleanup in story plan. | Static check wired |

## Pre-Execution Traceability Row Template

Each implementation story must add rows in this shape before execution:

| Task id | Story | FRs | LINUX-AC | Authority class | Command ids | Expected evidence | Release gates |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `task.example` | `story-linux-example.md` | `FR-26` | `LINUX-AC-12` | `allowed_unattended` | `linux.drift` | `evidence/example.json` | `LG-09` |

## Current Lane Story Traceability

| Task id | Story | FRs | LINUX-AC | Authority class | Command ids | Expected evidence | Release gates |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `linux.story.1.1` | `1-1-declare-certified-ubuntu-target-and-single-install-method.md` | `FR2`, `FR3`, `NFR10` | `LINUX-AC-01` | `allowed_unattended` | `linux.drift`, `linux.docs` | Docs drift report; story review packet | `LG-01`, `LG-02`, `LG-03` |
| `linux.story.1.2` | `1-2-enforce-local-identity-and-platform-preflight-gates.md` | `FR1`, `FR4`, `FR5`, `FR6` | `LINUX-AC-02` | `allowed_unattended` | `linux.bootstrap.tests`, `linux.smoke` | Local identity gate tests | `LG-02`, `LG-08` |
| `linux.story.1.3` | `1-3-provide-non-mutating-plan-and-verify-modes.md` | `FR7`, `FR8` | `LINUX-AC-03` | `allowed_unattended` | `linux.plan`, `linux.verify` | Non-mutating controller tests | `LG-04`, `LG-07` |
| `linux.story.1.4` | `1-4-reject-unsupported-remote-and-apply-arguments.md` | `FR10` | `LINUX-AC-04` | `allowed_unattended` | `linux.args`, `linux.entrypoint` | Unsupported argument rejection tests | `LG-03`, `LG-14` |
| `linux.story.1.5` | `1-5-enforce-shell-bootstrap-as-the-only-mutating-install-path.md` | `FR9` | `LINUX-AC-05` | `allowed_unattended` | `linux.drift`, `linux.contract` | Single mutating install boundary check | `LG-03`, `LG-14` |
| `linux.story.2.1` | `2-1-install-or-verify-approved-base-toolchain.md` | `FR11` | `LINUX-AC-06` | `requires_preauthorization` | `linux.bootstrap.install`, `linux.smoke` | Approved toolchain install/recovery tests | `LG-07`, `LG-15` |
| `linux.story.2.2` | `2-2-record-existing-versus-changed-tool-state.md` | `FR12` | `LINUX-AC-07` | `requires_preauthorization` | `linux.bootstrap.install`, `linux.verify` | `tool_changes` evidence validation | `LG-07`, `LG-15` |
| `linux.story.2.3` | `2-3-clone-or-validate-kendall-nxt-repo-state.md` | `FR13`, `FR14` | `LINUX-AC-08` | `requires_preauthorization` | `linux.repo.validate`, `linux.repo.clone` | Repo origin/clone recovery tests | `LG-07`, `LG-15` |
| `linux.story.2.4` | `2-4-block-cleanly-when-private-repo-access-is-missing.md` | `FR15` | `LINUX-AC-09` | `block_and_record` | `linux.repo.probe`, `linux.blocked.stdout` | Blocked repo-access evidence | `LG-06`, `LG-07`, `LG-11` |
| `linux.story.2.5` | `2-5-run-project-setup-and-final-verify-from-validated-checkout.md` | `FR16`, `FR17` | `LINUX-AC-10` | `requires_preauthorization` | `linux.setup`, `linux.final.verify` | Setup failure evidence; final verify evidence | `LG-07`, `LG-15` |
| `linux.story.2.6` | `2-6-prove-safe-rerun-behavior-across-install-states.md` | `FR24`, `FR36` | `LINUX-AC-11` | `requires_preauthorization` | `linux.bootstrap.rerun`, `linux.verify` | Idempotent rerun evidence | `LG-07`, `LG-15` |
| `linux.story.3.1` | `3-1-write-schema-compliant-success-failure-and-blocked-evidence.md` | `FR18`, `FR20` | `LINUX-AC-12` | `allowed_unattended` | `linux.evidence.schema` | Pass/fail/blocked evidence validation | `LG-07`, `LG-13` |
| `linux.story.3.2` | `3-2-emit-pre-repo-blocked-evidence-safely.md` | `FR19` | `LINUX-AC-13` | `block_and_record` | `linux.blocked.stdout` | Parseable stdout blocked evidence | `LG-07`, `LG-11` |
| `linux.story.3.3` | `3-3-enforce-evidence-redaction-and-required-fields.md` | `FR20` | `LINUX-AC-14` | `allowed_unattended` | `linux.evidence.schema` | Secret/auth artifact rejection tests | `LG-07`, `LG-13` |
| `linux.story.3.4` | `3-4-protect-evidence-paths-from-unsafe-writes.md` | `FR21` | `LINUX-AC-15` | `allowed_unattended` | `linux.evidence.path` | Evidence path and overwrite tests | `LG-07`, `LG-13`, `LG-14` |
| `linux.story.3.5` | `3-5-deny-automated-auth-and-secret-handling.md` | `FR22`, `FR23` | `LINUX-AC-16` | `allowed_unattended` | `linux.auth.boundary` | Auth-boundary source scan and schema tests | `LG-06`, `LG-07` |
| `linux.story.3.6` | `3-6-keep-troubleshooting-and-lessons-learned-current.md` | `FR26` | `LINUX-AC-17` | `allowed_unattended` | `linux.docs`, `linux.drift` | Troubleshooting and lessons learned updates | `LG-07`, `LG-13` |

## Completion Rule

The MVP cannot be marked complete unless every required gate is passed or
explicitly deferred by approved scope. Missing evidence, stale evidence, failed
redaction, unsupported platform overclaim, or open gated blocker prevents a
complete status.
