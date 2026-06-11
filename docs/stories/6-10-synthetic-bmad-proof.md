# Story 6.10: Synthetic BMAD Proof

Date: 2026-06-10
Status: Review

## Story

As Bob,
I want a synthetic BMAD artifact to move through Proposed Work, Active Work, orchestrated preview, and fake/blocked attempt evidence,
so that we can prove the integrated pipeline before using a real BMAD story.

## Context

Stories 6.3 through 6.9 established Candidate Work, BMAD parsing, Proposed Work, promotion, task packets, fake/blocked attempt evidence, and live Dev Console refresh. This story proves those pieces together with a synthetic BMAD artifact while preserving the no-execution authority boundary.

## Acceptance Criteria

1. A synthetic BMAD artifact can be imported into Candidate Work through a supervisor API.
2. The imported Candidate Work uses metadata-only parser output and does not copy raw artifact content.
3. The Candidate Work can be approved and promoted into exactly one Active WorkItem.
4. The Active WorkItem can produce a Task Packet preview and routing decision.
5. A fake or blocked execution attempt can attach Task Packet/source evidence.
6. Runtime evidence exposes the Candidate source, route, attempt, and artifact refs for Dev Console use.
7. The proof path does not launch workers, call providers, execute commands, mutate source by worker, perform Git operations, or call GitHub.

## Authority

Allowed:

- metadata-only BMAD import into Candidate Work,
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

- supervisor integration test proving the synthetic BMAD artifact path from import through attempt evidence,
- docs index check,
- full local check when API behavior or docs change.

## Proof Fixture

- `docs/product/epic-6-synthetic-dev-console-label-copy.md`
