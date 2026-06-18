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

## Completion Rule

The MVP cannot be marked complete unless every required gate is passed or
explicitly deferred by approved scope. Missing evidence, stale evidence, failed
redaction, unsupported platform overclaim, or open gated blocker prevents a
complete status.
