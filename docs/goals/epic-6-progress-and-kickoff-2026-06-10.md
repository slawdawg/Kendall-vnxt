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
| 1. Candidate Work foundation | In progress | Stories 6.3, 6.4, and 6.5 implemented and verified locally; Story 6.6 remains drafted. |
| 2. Orchestrated preview foundation | Not started | Story 6.7 drafted. |
| 3. Dev Console live pipeline | Not started | Realtime scope approved. |
| 4. Proof workflow | Not started | Synthetic first, then real BMAD story. |
| 5. Refactoring and maintenance foundation | Not started | Root-cause maintenance allowed when scoped. |
| 6. Safe local execution | Not started | Ollama approved only within current endpoint/model boundary until expanded. |
| 7. Git hygiene foundation | Not started | Read-only first. |
| 8. Local worktree management | Not started | Local only, no remote. |
| 9. Codex authority | Blocked pending approval | Dry-run/read-only first, then bounded implementation with approval. |
| 10. Claude authority | Blocked pending approval | Review-only, scarce-use policy. |
| 11. GitHub delivery | Blocked pending approval | Human-approved remote actions only. |
| 12. Cleanup | Not started | Local cleanup after done with evidence. |
| 13. MVP proof | Not started | One real BMAD story through delivery and cleanup. |

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
