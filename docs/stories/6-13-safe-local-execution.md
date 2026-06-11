# Story 6.13: Safe Local Execution

Date: 2026-06-10
Status: done

## User Story

As Bob,
I want the Dev Console to run a safe local evidence check from an active work item,
so that Ollama/local-lane help can start conserving stronger provider usage without silently gaining file, command, worker-launch, or Git authority.

## Context

Stories 4.1 through 4.4 established the disabled-default Ollama provider ladder, metadata-only retention, timeout/cancellation evidence, and the approved VM-to-host endpoint/model boundary. Stories 6.7 through 6.11 connected active work to Task Packet, routing, attempt, BMAD proof, and runtime evidence. This story exposes the existing local evidence explanation endpoint inside the work-item detail page.

This is not general worker execution. The dashboard action asks for `taskKind: evidence_summary`, records the evidence event, and only permits the `local_readonly` lane. Source mutation, command execution, Codex/Claude launch, Git, GitHub, and endpoint/model expansion remain out of scope.

## Acceptance Criteria

1. Work-item detail pages include a visible Local check panel and quick navigation link.
2. The panel can request a local read-only evidence explanation and record the event without a full browser reload.
3. The panel clearly shows that changes and commands are off.
4. When Ollama gates are disabled, the panel states that no model call was made.
5. When provider metadata is present, the panel shows only metadata such as model id, status, character counts, timeout state, and raw-payload retention status.
6. Browser coverage proves a user can run the safe local check from a work-item detail page.

## Implementation Notes

- Added `LocalEvidenceExplanationPayload` to shared contracts.
- Added `createLocalEvidenceExplanation()` to the dashboard supervisor client.
- Added `LocalEvidencePanel` on the work-item detail page, next to routing and runtime evidence.
- The dashboard sends `stepId: evidence_review`, `taskKind: evidence_summary`, and `recordEvent: true`.
- The existing supervisor service remains responsible for rejecting non-`local_readonly` routes and for keeping writes and commands disabled.

## Verification

Passed checks:

- `pnpm.cmd --filter @kendall/dashboard build`
- `PLAYWRIGHT_BROWSERS_PATH=C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "safe local check"`
- `pnpm.cmd run check`

## Authority Boundary

This story uses the approved local evidence explanation surface only. It does not approve new Ollama endpoints, new models, raw prompt/completion retention, command execution, file mutation, Codex/Claude CLI launch, Git/GitHub operations, autonomous merge, or external sends.
