# Epic 6 Follow-Up Hardening PR Body Draft

Date: 2026-06-11
Status: local draft only, no remote action taken

Use this draft only after Bob approves the branch-scoped GitHub delivery operation in `docs/goals/epic-6-follow-up-hardening-delivery-plan-2026-06-11.md`.

## Title

Harden Epic 6 cleanup and refresh completion audit

## Body

### Summary

This PR follows the merged Epic 6 milestone with cleanup and status hardening:

- Adds safer Windows worktree cleanup behavior for managed Codex workspaces.
- Adds `cleanup-orphans` for orphaned managed worktree directories that Git no longer tracks.
- Pre-cleans generated Python/cache artifacts before worktree removal.
- Documents the scoped elevated PowerShell fallback for Windows ACL/cache residue.
- Prevents supervisor pytest cache/temp residue from breaking full checks or cleanup.
- Refreshes the Epic 6 completion audit and handoff so they reflect that PR #86 was merged and local cleanup was handled.

### Why This Exists

After PR #86 was merged, local cleanup exposed a Windows ACL/cache residue failure around pytest-generated directories. The cleanup was recovered manually, then converted into durable tooling and runbook guidance so future long goal runs do not repeat the same failure mode.

The Epic 6 Dev Console audit and durable handoff also needed to move from the pre-merge state to the post-merge state.

### Verification

Local verification before delivery:

- `pnpm.cmd run test:codex-workspace`
- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "epic_6_completion_audit or supervisor_report_catalog or runtime_evidence_export"`
- `pnpm.cmd run check:docs`
- `pnpm.cmd run check`

Full local check result: dashboard build succeeded and 141 supervisor tests passed with one existing `aiosqlite` deprecation warning.

### Authority Boundary

This PR does not approve or perform:

- Codex CLI launch.
- Claude CLI launch.
- Provider/model expansion.
- Merge.
- Local or remote branch deletion.
- Local cleanup execution.
- Remote cleanup.
- GitHub issue/story sync.
- Autonomous end-to-end delivery.

It only hardens cleanup tooling, documents the operator flow, and refreshes read-only Epic 6 status evidence.

### Review Notes

- Review `scripts/codex-workspace.mjs` and `scripts/test-codex-workspace.mjs` first for cleanup behavior and safety boundaries.
- Review `docs/codex-workspace-cleanup-runbook.md` for operator instructions and admin fallback scope.
- Review `services/supervisor/pyproject.toml` and `scripts/run-supervisor-tests.mjs` for pytest cache prevention.
- Review `GET /supervisor/epic-6-completion-audit-report` expectations through `services/supervisor/tests/integration/test_routing_preview.py`.

