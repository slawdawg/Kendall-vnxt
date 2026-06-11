# Story 6.11: Real BMAD Story Proof

Date: 2026-06-10
Status: Review

## Story

As Bob,
I want a real existing BMAD story artifact to move through the same integrated proof path as the synthetic artifact,
so that the Dev Console pipeline proves it can preserve actual story metadata before authority expands.

## Context

Story 6.10 proved the integrated path with a synthetic BMAD artifact. This story repeats the path with `docs/stories/6-5-proposed-work-dev-console-view.md` and preserves parser metadata summaries as Candidate Work and WorkItem evidence.

## Acceptance Criteria

1. A real existing story artifact can be imported into Candidate Work through the BMAD import API.
2. Import retains metadata-only story evidence including story id, epic id, acceptance criteria summary, verification summary, allowed scope, and retention policy.
3. The imported Candidate Work can be approved and promoted into exactly one Active WorkItem.
4. The promoted WorkItem preserves the import metadata for Task Packet and runtime evidence use.
5. Task Packet preview carries the real story source artifact path and verification summary.
6. Fake or blocked execution attempt evidence links back to the Task Packet and real story artifact.
7. Runtime evidence exposes the real story metadata while preserving no-launch/no-provider/no-command/no-Git/no-GitHub safety boundaries.

## Authority

Allowed:

- metadata-only BMAD import metadata preservation,
- Candidate approval/promotion,
- routing preview and Task Packet preview,
- fake or blocked execution attempt evidence,
- supervisor API/service/tests/docs updates.

Blocked:

- worker launch,
- Codex/Claude/Ollama calls,
- command execution beyond tests,
- worker source mutation,
- Git/GitHub operations,
- cleanup automation.

## Verification

Required focused checks:

- supervisor integration test proving the real story path from import through runtime evidence,
- full local check because API schema, DB model, contracts, and docs change.

## Proof Fixture

- `docs/stories/6-5-proposed-work-dev-console-view.md`
