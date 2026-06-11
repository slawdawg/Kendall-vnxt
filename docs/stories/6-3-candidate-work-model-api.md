# Story 6.3: Candidate Work Model And API

Date: 2026-06-10
Status: done

## Story

As Bob,
I want BMAD and Chief of Staff outputs to become persisted Candidate Work before they enter the active Dev Console pipeline,
so that proposed work can be reviewed, prioritized, approved, rejected, or deferred without immediately triggering execution.

## Context

Epic 6 uses staged work creation:

```text
Draft Work
  -> Candidate Work
  -> Active Dev Console Work Item
  -> Orchestrated Execution
```

For MVP, Draft Work remains in BMAD artifacts or Chief of Staff memory. Active work continues to use the existing `WorkItem` model and supervisor contracts. Candidate Work needs a lightweight persisted proposal model so the Dev Console can show proposed work before promotion.

This story is the first code slice after the Epic 6 consolidation story. It must not add worker execution, process launch, source mutation by workers, GitHub remote operations, or automatic promotion to Active work.

## Acceptance Criteria

1. Add a persisted Candidate Work model with fields:
   - `id`
   - `title`
   - `requestedOutcome`
   - `source`
   - `sourceArtifactPath`
   - `sourceArtifactType`
   - `riskLevel`
   - `priority`
   - `status`
   - `createdAt`
   - `updatedAt`
   - `approvedAt`
   - `promotedWorkItemId`
2. Candidate Work status supports at least:
   - `proposed`
   - `approved`
   - `rejected`
   - `deferred`
3. Add shared contract/schema types for Candidate Work create, update, list, and view payloads.
4. Add supervisor API endpoints for:
   - creating Candidate Work,
   - listing Candidate Work,
   - updating Candidate Work status and priority metadata.
5. API validation prevents invalid `source`, `sourceArtifactType`, `riskLevel`, `priority`, or `status` values.
6. Candidate Work creation records enough metadata to link back to the originating BMAD or Chief of Staff artifact.
7. Candidate Work does not create an Active `WorkItem` in this story.
8. Candidate Work does not trigger orchestrator routing, execution attempts, worker launch, provider calls, command execution, Git operations, or GitHub remote operations in this story.
9. Supervisor integration tests cover create/list/update/status validation and prove no Active `WorkItem` is created.
10. Documentation/indexes are updated if new docs or contracts require index alignment.

## Authority

Allowed:

- local database/schema changes for Candidate Work,
- shared contract/schema updates,
- supervisor API read/write for Candidate Work only,
- focused tests.

Blocked:

- Active `WorkItem` promotion,
- orchestrator routing,
- execution attempt creation,
- Codex CLI process launch,
- Claude Code process launch,
- Ollama provider calls,
- command execution,
- source mutation by workers,
- GitHub remote operations,
- autonomous merge,
- cleanup automation.

## Implementation Notes

- Reuse existing supervisor database/session patterns.
- Keep Candidate Work separate from Active `WorkItem` for MVP.
- Prefer enum-style validation consistent with existing contracts.
- Keep Dev Console rendering for Candidate Work in a later story.
- Use metadata-only artifact references; do not copy full BMAD artifact content into Candidate Work records.

## Verification

Required focused checks:

- supervisor integration tests for Candidate Work model/API behavior,
- shared contract build/type validation through dashboard build or workspace check,
- documentation index checks if docs are changed.

Run full `pnpm.cmd run check` if shared contracts, dashboard build paths, or documentation drift checks are touched.
