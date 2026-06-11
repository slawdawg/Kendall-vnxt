# Story 6.7: Task Packet v0 And Orchestrated Preview

Date: 2026-06-10
Status: done

## Story

As Bob,
I want Active Dev Console work to produce a minimal orchestrator task packet and lane decision,
so that the system can explain how work would be handled before any execution authority is granted.

## Context

Stories 6.3-6.6 establish Candidate Work, Proposed Work, and promotion into Active `WorkItem` records. This story begins the orchestrator integration path by turning Active work into a minimal task packet and recording a preview-only lane decision.

This story should reuse or evolve the existing routing preview concepts instead of creating a duplicate lane-decision system.

## Acceptance Criteria

1. Add Task Packet v0 with fields:
   - `workItemId`
   - `title`
   - `requestedOutcome`
   - `source`
   - `sourceArtifactPath`
   - `taskKind`
   - `riskLevel`
   - `priority`
   - `approvalMode`
   - `verificationSummary`
2. Task Packet v0 can be built from an Active `WorkItem` promoted from Candidate Work.
3. Existing routing preview or successor orchestrated preview consumes Task Packet v0 metadata.
4. The preview records:
   - selected lane,
   - rejected lanes,
   - authority mode,
   - reason codes,
   - human-readable "why this path" explanation.
5. Preview-only behavior does not create execution attempts unless explicitly part of fake/blocked evidence in a successor story.
6. Preview-only behavior does not launch workers, call providers, execute commands, mutate source, perform Git operations, or call GitHub remote APIs.
7. Dev Console or API can retrieve the task packet/preview evidence for an Active work item.
8. Tests cover packet construction, lane decision, blocked/unsupported metadata, and no-execution behavior.

## Authority

Allowed:

- task packet construction,
- preview-only lane decision,
- metadata-only evidence,
- focused tests.

Blocked:

- execution attempts unless fake/blocked successor scope explicitly allows them,
- Codex/Claude/Ollama calls,
- command execution beyond tests,
- source mutation,
- Git/GitHub operations,
- cleanup automation.

## Implementation Notes

- Prefer extending existing `RoutingProfile`/`RoutingDecision` concepts.
- Keep packet fields minimal until real workflows prove more fields are needed.
- Use user-facing "Why this path" language in Dev Console contexts.
- Keep raw prompt/completion/provider payload retention blocked.

## Verification

Required focused checks:

- supervisor integration tests for Task Packet v0 and preview behavior,
- contract/type checks if shared contracts change,
- docs index checks if story/architecture docs are updated.

Run full `pnpm.cmd run check` when shared contracts or dashboard behavior are touched.
