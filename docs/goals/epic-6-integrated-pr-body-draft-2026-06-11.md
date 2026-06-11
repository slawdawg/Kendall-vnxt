# Epic 6 Integrated PR Body Draft

Date: 2026-06-11
Status: local draft only, no remote action taken

Use this draft only after Bob approves the branch-scoped GitHub delivery operation in `docs/goals/epic-6-delivery-packaging-plan-2026-06-11.md`.

## Title

Implement Epic 6 Dev Console orchestration pipeline and readiness controls

## Body

### Summary

This PR packages the local Epic 6 milestone stack into one coherent review:

- Candidate Work intake, BMAD import, Proposed Work review, priority/order controls, and promotion into Active Work.
- Task Packet v0 preview, orchestrator lane evidence, fake or blocked execution-attempt evidence, and runtime evidence export integration.
- Dev Console live state, Controls report visibility, startup availability, safe local evidence checks, Git hygiene, and local worktree planning.
- Read-only authority preparation for Codex, Claude, GitHub delivery, local cleanup, remote cleanup/sync, trusted autonomy, and Epic 6 completion audit visibility.

### Story Slices

- Stories 6.3-6.11: Candidate Work through synthetic and real BMAD proof.
- Stories 6.12-6.15: startup availability, safe local evidence checks, Git hygiene, and local worktree planning.
- Stories 6.16-6.24: Codex/Claude readiness and approval packets, GitHub delivery authority ladder, cleanup readiness, trusted autonomy readiness, and Epic 6 completion audit visibility.

### Verification

Local verification on the stack before delivery:

- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "epic_6_completion_audit or supervisor_report_catalog or runtime_evidence_export"`
- `pnpm.cmd --filter @kendall/dashboard build`
- `PLAYWRIGHT_BROWSERS_PATH=C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "compact routing fleet data"`
- `pnpm.cmd run check:reports`
- `pnpm.cmd run check:runtime-export`
- `pnpm.cmd run check:docs`
- `pnpm.cmd run check`

Full local check result: 141 supervisor tests passed with one existing `aiosqlite` deprecation warning.

### Authority Boundary

This PR does not approve or perform:

- Codex CLI launch.
- Claude CLI launch.
- Merge.
- Closing PR #85.
- Local worktree or branch deletion.
- Remote branch deletion.
- GitHub issue/story sync.
- Provider/model expansion beyond the approved host Ollama boundary.
- Raw prompt/completion retention.
- Autonomous end-to-end delivery.

Read-only reports and approval packets prepare those future authority decisions but keep their approval booleans false.

### Current Remaining Blockers

Epic 6 is not complete after this PR is opened. Completion still requires:

- approved remote PR delivery and CI/review evidence,
- separately approved merge,
- one real BMAD story reaching final done/evidence state through approved implementation, delivery, and cleanup,
- separately approved cleanup closeout,
- any approved Codex or Claude execution to be scoped through their approval packet reports.

### Review Notes

- Review by story slice, starting with the Candidate Work/BMAD intake flow, then Active Work/evidence flow, then authority reports.
- PR #85 currently represents the earlier Story 6.3 branch. Do not close it unless Bob explicitly approves closeout after this integrated PR exists.
- Use `GET /supervisor/epic-6-completion-audit-report` or Controls `#epic-6-completion-audit-report` to see the remaining blocker list in the Dev Console.
