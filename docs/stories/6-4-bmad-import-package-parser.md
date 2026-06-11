# Story 6.4: BMAD Import Package Parser

Date: 2026-06-10
Status: Review

## Story

As Bob,
I want local BMAD and story markdown artifacts to be converted into Candidate Work import packages,
so that structured planning output can enter the Dev Console pipeline without manual retyping.

## Context

Story 6.3 adds Candidate Work persistence and API. This story adds the import boundary that turns local repo planning artifacts into Candidate Work create payloads.

Initial supported sources:

- `docs/stories/*.md`
- `docs/prds/*.md`
- `docs/product/*.md`
- `_bmad-output/planning-artifacts/**`

The parser should be pragmatic and progressive. It should support explicit frontmatter/headings when present and fallback summaries when artifacts vary. It should not attempt perfect parsing of every BMAD artifact type in the MVP.

## Acceptance Criteria

1. Add a BMAD import package contract with fields:
   - `title`
   - `requestedOutcome`
   - `sourceArtifactPath`
   - `sourceArtifactType`
   - `artifactTitle`
   - `storyId`, if available
   - `epicId`, if available
   - `acceptanceCriteria` summary
   - `riskLevel`
   - `recommendedPriority`
   - `verificationSummary`
   - `allowedScope`, if known
   - `notes`
2. Parser accepts local markdown artifact paths under the supported source roots.
3. Parser rejects paths outside supported source roots.
4. Parser extracts frontmatter/title/status when present.
5. Parser extracts story title and story id from story filenames/headings when possible.
6. Parser extracts acceptance criteria and verification sections when present.
7. Parser creates a safe fallback import package when optional sections are missing.
8. Parser does not retain raw prompt/completion/reasoning/provider payloads.
9. Parser does not copy entire artifact contents into Candidate Work records.
10. Focused tests cover supported sources, missing sections, path rejection, and fallback behavior.

## Authority

Allowed:

- local file reads from supported repo artifact paths,
- metadata extraction,
- Candidate Work import package creation,
- focused tests.

Blocked:

- creating Active `WorkItem` records,
- orchestrator routing,
- execution attempts,
- provider/model calls,
- Codex/Claude process launch,
- command execution beyond tests,
- GitHub remote operations,
- source mutation by workers.

## Implementation Notes

- Prefer structured parsing of markdown headings/frontmatter over ad hoc full-text copying.
- Keep output small and metadata-oriented.
- Treat artifact path as the durable source reference.
- Candidate Work persistence can be called by a later story or by an explicit endpoint if Story 6.3 exposes one.

## Verification

Required focused checks:

- parser/unit tests for supported source roots and rejection behavior,
- supervisor tests if the parser is exposed through the supervisor API,
- documentation index checks if docs are changed.

Run full `pnpm.cmd run check` if shared contracts, dashboard build paths, or documentation drift checks are touched.
