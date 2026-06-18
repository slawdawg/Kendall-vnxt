---
project_name: 'Kendall_Nxt'
user_name: 'Bob'
date: '2026-06-18'
sections_completed: ['technology_stack', 'language_specific_rules', 'framework_specific_rules', 'testing_rules', 'code_quality_style_rules', 'development_workflow_rules', 'critical_dont_miss_rules']
existing_patterns_found: 25
status: 'complete'
rule_count: 88
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- Use Node `>=22 <25` and pnpm `11.5.2`; do not switch package managers or introduce npm/yarn lockfiles.
- Treat `apps/dashboard` as the repo-pinned Next.js `16.2.7` / React `19.2.4` operator UI with TypeScript strict mode, Tailwind CSS `^4`, and ESLint `^9`.
- Do not move system-of-record state, authority decisions, execution attempts, or evidence metadata into Next.js routes, local storage, or client-only dashboard state.
- Treat `packages/contracts` as the shared transport vocabulary and `packages/workflow-core` as shared workflow semantics; do not duplicate workflow states, API view shapes, candidate-work models, execution-attempt models, or evidence models elsewhere.
- Treat `services/supervisor` as a Python `>=3.12` FastAPI service using async SQLAlchemy and Pydantic schemas; it owns durable work state, supervisor APIs, execution attempts, evidence metadata, and authority checks.
- Use `uv` or the supervisor venv interpreter for supervisor Python checks; do not rely on bare `python` for project checks on this machine.
- Runtime packaging under `runtime/` targets Python `>=3.11`; do not assume supervisor dependencies, environment, or internals apply there.
- Use Playwright `^1.61.0` for browser-driven dashboard coverage; prefer package-local unit/integration checks for non-browser logic.
- Broaden verification when touching contracts, workflow-core, supervisor API boundaries, authority transitions, execution state, or evidence behavior.
- Do not introduce new app frameworks, state managers, ORMs, test runners, build tools, or framework/runtime version upgrades without an explicit architecture decision and matching lockfile/evidence updates.
- Real execution/provider calls remain disabled unless an explicit approval or policy path exists; stack capability is not execution permission.

## Critical Implementation Rules

### Language-Specific Rules

- In TypeScript, preserve strict typing and use `import type` for type-only imports; `packages/contracts` uses `verbatimModuleSyntax`.
- Define cross-boundary API types and string vocabularies in `packages/contracts` first; do not redefine shared interfaces inside apps or services.
- Treat `packages/contracts/src/workflow.ts` as the source of truth for workflow vocabulary; mirror shared wire values deliberately in Python `StrEnum` types.
- Keep contract literals and Python `StrEnum` values stable and identical across the dashboard/supervisor boundary; avoid repeated magic strings in route or service code.
- Prefer explicit interfaces, discriminated unions, and exhaustive handling for known API/workflow shapes; reserve `Record<string, unknown>` for intentionally opaque metadata fields with clear ownership.
- Keep API payload/view fields camelCase in TypeScript contracts and Pydantic schemas; keep Python internals and persistence models idiomatic snake_case.
- When changing shared contracts, update TypeScript interfaces, Python schemas/enums, and affected tests in the same change.
- Keep supervisor request paths async: use SQLAlchemy `AsyncSession` and avoid sync I/O or long-running work in handlers/services unless isolated behind an explicit async boundary or worker handoff.
- Persisted, event, and API timestamps must be timezone-aware UTC, following `datetime.now(timezone.utc)`.
- Keep Python mutable defaults behind `Field(default_factory=...)`, callable SQLAlchemy defaults, or equivalent factory patterns.

### Framework-Specific Rules

- Fetch supervisor data at Next.js server boundaries when rendering read views; keep pages/layouts focused on composition and pass typed contract views into operational components.
- Put browser-only behavior behind explicit `"use client"` components; do not read browser storage, profile state, router hooks, or runtime browser APIs from server components.
- In server dashboard code, use `requestJson<T>()` for supervisor reads; in browser components, use `getSupervisorBaseUrl()` for browser-initiated supervisor calls.
- Use shared contract types for dashboard-supervisor transport; pass typed view data into client components instead of parsing raw API envelopes in UI controls.
- Do not derive, persist, or cache workflow state in Next.js as source-of-truth state; render supervisor state and send mutations back to supervisor-owned APIs.
- Dashboard mutations should handle supervisor envelope/error responses explicitly, then refresh/revalidate supervisor-backed data using existing Next router patterns.
- Keep server-only helpers out of client components and browser-only helpers out of server components.
- Design dashboard surfaces as operator work queues: prioritize state, freshness, evidence, authority, blockers, audit history, and next safe operator action; avoid landing-page patterns, promotional cards, vague value props, and decorative visuals.
- In FastAPI, keep route handlers thin: translate HTTP input into domain/service calls and return contract-shaped `ApiEnvelope(data=...)` responses.
- Avoid embedding workflow decisions in API routes; delegate workflow behavior, validation, and authority checks to `SupervisorService` or domain modules.
- Translate domain/service failures to structured `HTTPException` details at the route boundary.
- Use FastAPI dependency injection for database sessions; do not manually create sessions inside route handlers.
- Keep CORS, background polling, and app lifecycle behavior centralized in `services/supervisor/src/supervisor/api/main.py` and settings modules.

### Testing Rules

- Keep verification scoped first: run the smallest deterministic check that covers the touched behavior, then broaden only when the change crosses contracts, workflow-core, supervisor API, dashboard build, authority, execution, evidence, report drift, or lifecycle boundaries.
- Test at the owning boundary: contracts validate shared vocabulary and schemas; workflow-core validates workflow semantics; supervisor validates state/API/authority/evidence; dashboard tests validate operator rendering and interaction.
- Use `pnpm run test:supervisor` for supervisor integration tests; the raw fallback is `uv run --directory services/supervisor pytest` when debugging the Python layer directly.
- In supervisor tests, use isolated temp SQLite databases, seeded records, fake adapters, disabled pollers, and explicit cleanup expectations unless the test intentionally covers those behaviors.
- Route/API tests should verify envelope shape, dependency wiring, HTTP status/error translation, contract-aligned response fields, and negative paths for invalid input, missing resources, authority denial, and downstream service failure.
- Service/domain tests should cover workflow decisions, state transitions, authority decisions, evidence records, and recovery/error paths when behavior touches execution or mutation.
- Do not treat Playwright as service correctness coverage; browser tests verify dashboard flows and API wiring, while supervisor tests own API/domain/persistence behavior.
- Use Playwright for browser-driven dashboard behavior under `tests/e2e`; rely on the existing config to start supervisor/dashboard with isolated ports and test database.
- Prefer focused E2E runners such as `pnpm run test:e2e:dashboard:controls`, `:detail`, `:mobile`, `:managed`, or `:provider-raw-output` when only that surface changed.
- Add or update mobile E2E coverage when dashboard changes affect controls, detail panes, navigation, approval surfaces, or evidence review.
- Use fake/local adapters for provider calls, process launch, remote mutation, credentials, and network boundaries; tests must not cross those boundaries unless an explicit approval/policy path exists.
- Safety regression tests should prove denied actions stay denied, dry-runs do not mutate, preview/report precedes execution, and allowed automation writes reviewable evidence.
- Broaden to full `pnpm run check` when shared contracts, schema/report drift, authority gates, provider/process policy, runtime evidence, workflow lifecycle, or cross-package behavior changes.
- When adding or renaming verification commands, update package scripts, docs/index references, and drift checks together.

### Code Quality & Style Rules

- Use kebab-case filenames for dashboard components and PascalCase for exported React components.
- Prefer shared helpers, package entry points, and existing exports over duplicated label maps, page-local DTOs, or deep internal imports.
- Use Tailwind utilities with existing CSS variables; avoid one-off color systems, broad visual restyles, or screen-specific state treatments.
- Reuse shared dashboard patterns for loading, empty, blocked, stale, error, and success states.
- Keep operator-facing work item hierarchy consistent: state, blocker, owner, evidence, authority, and next safe action should use stable labels and relative prominence across dashboard views.
- Use explicit action copy for mutating or authority-sensitive controls; avoid generic labels when an action changes state, launches work, calls providers, or affects retention.
- Preserve established domain vocabulary for Candidate Work, WorkItem, ExecutionAttempt, events, evidence, blockers, authority, and cleanup state; extend existing lifecycle models instead of creating parallel concepts.
- Prefer structured objects, schemas, and typed manifests over ad hoc string parsing for evidence, workflow state, authority records, and runtime metadata.
- When changing workflow, authority, evidence, or execution semantics, update contracts/types before implementation and UI behavior.
- Avoid new dependencies for formatting, dates, state, UI primitives, or parsing unless the repo already uses them or the maintenance cost is explicitly justified.
- Add comments only for non-obvious policy, safety, authority, or recovery logic.
- Keep narrow changes narrow: avoid repo-wide formatting, generated rewrites, or unrelated cleanup.
- When changing durable agent behavior or workflow rules, update `AGENTS.md` or the relevant docs/runbook instead of relying on chat-only guidance.

### Development Workflow Rules

- Follow `AGENTS.md` as the source of truth for repo-specific agent behavior, Windows/PowerShell constraints, tool-churn handling, Git hygiene, workspace lifecycle, and authority boundaries.
- On native Windows sandbox sessions, run shell diagnostics and verification serially; verify direct tool availability before resolver scripts or package-manager indirection.
- Use `node ./scripts/codex-workspace.mjs` for documented Codex workspace lifecycle work: `start`, `list`, `resume`, `finish-pr`, `cleanup-merged`, `rebuild-index`, and `doctor`.
- Before edits, check diff scope with `git diff --stat` or `git diff --name-only`; do not revert, format, stage, or reorganize unrelated user changes.
- Stage intended files explicitly for delivery; use `--stage-all` only after confirming the full worktree diff belongs to the task.
- Treat GitHub delivery, pushes, PR creation, merges, branch deletion, cleanup, provider calls, worker launch, and remote mutation as authority-gated operations.
- Authority-gated operations require explicit operation, scope, authority family, approval source, expected evidence, and recovery path; generic continuation does not approve new authority.
- Use progressive authority for automation: define contracts first, preview or dry-run, then read-only integration, bounded write integration, and only then human-approved execution.
- Automated actions must leave durable evidence of what ran, why it was allowed, input/output summary, result, next step, recovery path, and cleanup state.
- For long-running goals, maintain durable milestone state: current milestone, completed work, next safe step, blockers, verification state, and open approval requests.
- If one lane is blocked on authority, pause that lane and continue other safe unblocked work; stop only when no meaningful safe work remains.
- For cleanup, preserve evidence, run dry-runs first, inspect the result, and apply only when the output matches the intended scope.
- For repeated tool or command failures, stop blind retries and follow `docs/workflows/tool-churn-rca.md`; after repeated sandbox runner timeouts on read-only verification, request approved outside-sandbox execution.
- Use the matching BMAD workflow for durable planning, architecture, PRD, story, sprint, retrospective, and review artifacts.
- Promote durable BMAD outputs into `docs/`; keep local runtime state and generated working artifacts out of source.

### Critical Don't-Miss Rules

- Capability is not permission: do not perform provider calls, process launches, remote writes, GitHub mutations, sensitive reads, credential access, cleanup, or destructive actions without explicit scoped authority for that operation, scope, and authority family.
- Authority is scoped and non-transferable; approvals expire at the approved boundary and do not implicitly carry across lanes, sessions, tools, or follow-up actions.
- The supervisor is the system of record for workflow state, authority, attempts, evidence, events, and cleanup; the dashboard must render and command through supervisor APIs.
- Do not create parallel lifecycle models for Candidate Work, WorkItem, ExecutionAttempt, events, evidence, cleanup, or authority.
- Preserve source/evidence boundaries: store metadata, links, summaries, and evidence references; do not retain raw prompts, reasoning traces, secrets, provider payloads, or unnecessary source copies unless approved.
- Dashboard, CLI, and service controls must show or produce consequence before action: what runs, what mutates, authority required, evidence produced, and recovery path.
- Mutating automation must be previewable, idempotent, and recoverable; define dry-run/report output, retry/resume behavior, and cleanup evidence before enabling real writes.
- Disabled execution paths must fail closed and stay visibly testable; do not replace provider or worker stubs with real execution without explicit authority, contract updates, and verification.
- When a governed surface changes, update the contract, service, UI, docs, and focused check/test script together; include migration or compatibility notes for contract shape changes.
- Do not hide automation: every automated action must leave reviewable evidence with operation, authority, input/output summary, result, next step, recovery, retry, and cleanup state.
- Treat local-first as a safety boundary, not unrestricted filesystem, process, credential, account, or network access.
- If a command/tool path fails twice or hits sandbox runner timeout before output, stop retrying and route to Tool Churn RCA.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing code in Kendall_Nxt.
- Follow all rules exactly as documented.
- When in doubt, prefer the more restrictive authority, evidence, and verification path.
- Update this file when durable project patterns change.

**For Humans:**

- Keep this file lean and focused on non-obvious agent needs.
- Update it when technology stack, authority boundaries, workflow ownership, or verification patterns change.
- Review periodically for outdated rules.
- Remove rules that become obvious or superseded by stronger source-of-truth docs.

Last Updated: 2026-06-18
