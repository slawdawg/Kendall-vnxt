# Epic 6 Progress And Kickoff

Date: 2026-06-10
Status: draft kickoff artifact

## Purpose

Track the long-running Epic 6 goal without relying on chat memory.

The goal may continue across multiple stories and milestones until Epic 6 MVP is complete. Approval-gated work should pause only the gated lane/task while safe unblocked work continues.

## MVP Completion Target

Epic 6 MVP is complete when one real BMAD story moves through:

```text
Candidate Work
  -> Active Dev Console Work
  -> orchestrated lane decision
  -> safe local/Ollama checks
  -> bounded Codex implementation with approval
  -> verification
  -> bounded Claude review when justified or approved
  -> GitHub delivery with approval
  -> local cleanup
  -> Dev Console done/evidence state
```

## Current Milestone Status

| Milestone | Status | Notes |
| --- | --- | --- |
| 1. Candidate Work foundation | Complete locally | Stories 6.3, 6.4, 6.5, and 6.6 implemented and verified locally; remote delivery remains approval-gated. |
| 2. Orchestrated preview foundation | Complete locally | Stories 6.7 and 6.8 implemented read-only task packet preview/evidence links without execution authority. |
| 3. Dev Console live pipeline | Complete locally | Story 6.9 implemented SSE-backed dashboard refresh without polling or full browser reloads. |
| 4. Proof workflow | In progress | Story 6.10 implements the synthetic BMAD proof; Story 6.11 implements the real BMAD story proof. |
| 5. Refactoring and maintenance foundation | Not started | Root-cause maintenance allowed when scoped. |
| 6. Startup availability | Complete locally | Story 6.12 adds verification for Windows logon startup tasks and live endpoints. |
| 7. Safe local execution | Not started | Ollama approved only within current endpoint/model boundary until expanded. |
| 8. Git hygiene foundation | Not started | Read-only first. |
| 9. Local worktree management | Not started | Local only, no remote. |
| 10. Codex authority | Blocked pending approval | Dry-run/read-only first, then bounded implementation with approval. |
| 11. Claude authority | Blocked pending approval | Review-only, scarce-use policy. |
| 12. GitHub delivery | Blocked pending approval | Human-approved remote actions only. |
| 13. Cleanup | Not started | Local cleanup after done with evidence. |
| 14. MVP proof | Not started | One real BMAD story through delivery and cleanup. |

## Approval Queue

Use this section for authority requests Bob can handle asynchronously. A pending approval blocks only the named lane/task; the goal should continue other safe work.

| Request | Status | Scope | Requested Evidence | Decision |
| --- | --- | --- | --- | --- |
| Codex dry-run/read-only checks | pending future request | Verify CLI availability/auth and no-write behavior | Command shape, no-write proof, retention proof | TBD |
| Codex bounded implementation | pending future request | One approved Active work item in isolated worktree | Worktree plan, path scope, verification command, rollback/cleanup plan | TBD |
| Claude dry-run/read-only review | pending future request | Verify review-only invocation and scarce-use policy | Command shape, no-write proof, bounded context proof | TBD |
| Claude bounded review | pending future request | High-risk or explicitly approved work item review | Diff/context scope, review-only output, usage reason | TBD |
| GitHub delivery remote actions | pending future request | Push/PR/update/check delivery for approved work | Branch/PR plan, CI/check evidence, rollback plan | TBD |
| Merge | stretch / pending future request | Merge approved PR | Green checks, review gates, explicit merge approval | TBD |
| Remote cleanup | stretch / pending future request | Delete remote branch or sync issue/story status | Completed delivery evidence, cleanup plan | TBD |

## Current Safe Work

- Implement Candidate Work model/API.
- Story 6.3 implemented Candidate Work persistence/API/contracts with no promotion or execution side effects.
- Story 6.4 implemented BMAD import package parser/contracts with metadata-only artifact summaries.
- Story 6.5 implemented the read-only Proposed Work Dev Console view.
- Implement Candidate priority/order/promote.
- Implement task packet v0 and orchestrated preview without execution.
- Implement SSE-backed Dev Console live refresh without polling or full browser reloads.
- Prove the synthetic BMAD artifact path through Candidate Work, Active Work, routing preview, fake/blocked attempt, and runtime evidence.
- Prove a real BMAD story artifact path with metadata-only story evidence preserved through Task Packet and runtime evidence.
- Verify Windows startup/logon tasks and live Dashboard/Supervisor availability through a redacted startup readiness report.
- Improve docs/tests/scripts when root-cause maintenance is scoped and verified.

## Stop/Continue Rules

- Continue safe unblocked work when one authority lane is waiting for Bob.
- Stop only when no meaningful safe work remains, unsafe behavior appears, scope expands beyond MVP, or the gated operation is the next unavoidable step.
- Generic continuation language does not approve new authority families.
- Record all approvals and denials in the authority ledger.

## Kickoff Checklist

- Confirm current worktree/branch.
- Confirm `git status --short --branch`.
- Confirm latest verification state.
- Confirm first active milestone.
- Confirm blocked authorities.
- Confirm whether any pending approval has been granted.
- Confirm Dev Console/supervisor startup expectations when touching runtime startup.
- Start with Story 6.3 unless Bob explicitly changes the first implementation target.

## Implementation Log

- 2026-06-10: Story 6.3 implemented Candidate Work persistence, supervisor API endpoints, shared contracts, and integration tests. Verification passed with `uv run --directory services/supervisor pytest tests/integration/test_candidate_work_api.py -q`, `services/supervisor/.venv/Scripts/python.exe -m pytest services/supervisor/tests/integration -q`, `pnpm.cmd --filter @kendall/dashboard build`, and `pnpm.cmd run check`.
- 2026-06-10: Story 6.4 implemented a metadata-only BMAD markdown import package parser for supported repo artifact roots, shared package contracts, and focused parser tests. Verification passed with `uv run --directory services/supervisor pytest tests/integration/test_bmad_import_parser.py -q`, `uv run --directory services/supervisor pytest tests/integration -q`, `pnpm.cmd --filter @kendall/dashboard build`, and `pnpm.cmd run check`.
- 2026-06-10: Story 6.5 implemented the read-only Proposed Work route, navigation entry, Candidate Work fetch, empty state, visual cards, and desktop/mobile browser coverage. Verification passed with `pnpm.cmd --filter @kendall/dashboard build`, `PLAYWRIGHT_BROWSERS_PATH=C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "proposed work"`, `PLAYWRIGHT_BROWSERS_PATH=C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright pnpm.cmd exec playwright test tests/e2e/dashboard-mobile.spec.ts -g "proposed work"`, and `pnpm.cmd run check`.
- 2026-06-10: Story 6.6 implemented Candidate Work priority/order updates, approve/reject/defer controls, guarded one-time promotion into Active WorkItem records, and metadata/evidence links back to the proposal artifact. Verification passed with `pnpm.cmd run test:supervisor -- tests/integration/test_candidate_work_api.py -q`, `pnpm.cmd --filter @kendall/dashboard build`, `PLAYWRIGHT_BROWSERS_PATH=C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "proposed work"`, `PLAYWRIGHT_BROWSERS_PATH=C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright pnpm.cmd exec playwright test tests/e2e/dashboard-mobile.spec.ts -g "proposed work"`, and `pnpm.cmd run check`.
- 2026-06-10: Story 6.7 implemented Task Packet v0 and a read-only orchestrated preview endpoint that reuses routing preview decisions without creating execution attempts or granting provider/command authority. Verification passed with `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "task_packet_preview"`, `pnpm.cmd --filter @kendall/dashboard build`, and `pnpm.cmd run check`.
- 2026-06-10: Story 6.8 attached Task Packet v0 evidence to existing fake/blocked execution attempts through artifact refs and workflow-event payloads without worker launch, provider calls, command execution, source mutation, Git, or GitHub operations. Verification passed with `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "task_packet_artifact or packet_linked_attempt"` and `pnpm.cmd run check`.
- 2026-06-10: Story 6.9 implemented SSE-backed Dev Console refresh for Candidate Work and WorkItem changes, mounted a shared realtime refresh listener across dashboard pages, kept live feed EventSource reconnect behavior active, and removed full browser reloads from Proposed Work controls. Verification passed with `pnpm.cmd --filter @kendall/dashboard build`, `PLAYWRIGHT_BROWSERS_PATH=C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "shows proposed work"`, and `pnpm.cmd run check`.
- 2026-06-10: Story 6.10 implemented a metadata-only BMAD import endpoint and synthetic BMAD proof fixture that flows through Candidate Work, approval/promotion, Task Packet preview, routing preview, fake/blocked execution attempt evidence, and runtime evidence export without worker launch, provider calls, command execution, source mutation, Git, or GitHub operations. Verification passed with `pnpm.cmd run test:supervisor -- tests/integration/test_candidate_work_api.py -q` and `pnpm.cmd run check`.
- 2026-06-10: Story 6.11 preserved metadata-only BMAD import evidence for a real story artifact through Candidate Work, promoted WorkItem metadata, Task Packet preview, fake/blocked attempt evidence, and runtime evidence export. Verification passed with `pnpm.cmd run test:supervisor -- tests/integration/test_candidate_work_api.py -q` and `pnpm.cmd run check`.
- 2026-06-10: Story 6.12 added Windows startup verification for scheduled logon tasks, Dashboard/Supervisor endpoint readiness, and redacted startup reports. Verification passed with PowerShell parser validation for `scripts/windows/*.ps1` startup scripts and `pnpm.cmd run check`.
