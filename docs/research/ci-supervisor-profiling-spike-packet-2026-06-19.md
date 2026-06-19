---
date: 2026-06-19
status: spike packet
topic: CI speed and supervisor test performance
input_documents:
  - docs/handoffs/codex-handoff-2026-06-19-non-orchestrator-backlog.md
  - docs/research/non-orchestrator-backlog-decision-matrix-2026-06-19.md
  - docs/workflows/ci-gate-behavior.md
  - package.json
---

# CI And Supervisor Profiling Spike Packet

## Executive Summary

CI speed work should start with measurement, not restructuring. Kendall_Nxt
already has tiered PR CI and a supervisor profiling script:

```text
pnpm run test:supervisor:profile
```

Recommended next step: run a narrow profiling spike that captures local timing,
slowest supervisor tests, and current GitHub job timing before changing CI,
splitting suites, or rewriting fixtures.

## Problem

The non-orchestrator backlog identified CI wait time and supervisor test runtime
as recurring friction. The current observation is that supervisor CI can take
around 2-3 minutes on GitHub, but that is not enough evidence to justify
structural changes.

Potential causes are different and need different fixes:

- a few slow supervisor tests;
- fixture setup repeated across tests;
- integration tests mixed with unit tests;
- Python environment setup cost;
- JavaScript/dashboard checks running when irrelevant;
- GitHub Actions scheduling or cache behavior;
- local vs CI environment mismatch.

## Current Command Surface

Existing scripts from `package.json`:

| Script | Purpose |
| --- | --- |
| `pnpm run check:static` | Documentation, authority, evidence, policy, and workspace static checks. |
| `pnpm run build:dashboard` | Dashboard build check. |
| `pnpm run test:supervisor` | Supervisor test suite. |
| `pnpm run test:supervisor:profile` | Supervisor test suite with pytest duration reporting. |
| `pnpm run check` | Full local gate: preflight, static checks, workspace command resolution, dashboard build, supervisor tests. |

Existing CI behavior:

- pull requests run path-scoped component jobs plus a final `check` job;
- skipped component jobs are accepted when path filters do not match;
- pushes to `main` run the full serial `pnpm run check` gate.

## Spike Questions

The spike should answer:

1. Which GitHub Actions jobs dominate PR feedback time?
2. Which local command dominates `pnpm run check`?
3. Which supervisor tests are slowest under `test:supervisor:profile`?
4. Are slow tests integration-heavy, fixture-heavy, environment-heavy, or
   intrinsically slow?
5. Is there a safe split between fast unit checks and slower integration checks?
6. Can fixture reuse, narrower parametrization, or targeted mocks reduce time
   without reducing confidence?

## Measurement Plan

Run from a clean worktree when possible. These commands are observational for
the spike: they should collect timing and test evidence, not edit CI, scheduler
state, services, credentials, workers, providers, or persistent runtime state.

```text
node --version
pnpm --version
mise --version
pnpm run check:static
pnpm run build:dashboard
pnpm run test:supervisor:profile
```

If the question is full local gate runtime, also run:

```text
pnpm run check
```

For GitHub timing, collect:

- latest PR component job durations;
- latest `main` full-check duration;
- failed or cancelled check patterns if present;
- whether path filters skipped expected jobs.

Do not use GitHub timing as the only evidence. Compare it with local profiling
so the recommendation can distinguish test slowness from CI overhead.

Stop the spike and write down the blocker instead of retrying blindly when:

- a command fails twice with the same tool or environment failure;
- a command would require provider, worker, credential, cleanup, scheduler, or
  service mutation authority;
- profiling output suggests a CI or test change before a baseline evidence file
  exists;
- GitHub timing cannot be collected without expanding scope beyond read-only
  metadata inspection.

## Evidence To Capture

The spike should produce one evidence file with:

- date, branch, commit, OS/session context;
- command versions;
- command start/end times or shell timing output;
- `test:supervisor:profile` slowest test list;
- GitHub job names and durations if available;
- top suspected bottlenecks;
- recommended next story, if any;
- checks intentionally not run and why.

Suggested output path:

```text
docs/workflows/ci-supervisor-profiling-evidence-YYYY-MM-DD.md
```

## Decision Rules

Promote to implementation only if profiling identifies a specific low-risk
improvement.

| Evidence | Likely Follow-Up |
| --- | --- |
| One or two tests dominate runtime | Story to optimize those tests or fixtures. |
| Many integration tests dominate runtime | Story to split fast/slow supervisor suites with clear CI policy. |
| Environment setup dominates | Story to improve caching or preflight behavior. |
| Dashboard build dominates unrelated PRs | Review path filters before changing build. |
| GitHub queue/setup dominates | Document as CI overhead; avoid test rewrites. |
| No clear bottleneck | Keep current CI and stop. |

## Guardrails

Do not change CI before evidence exists.

Do not reduce coverage just to make CI faster. Any split must preserve:

- full gate on `main`;
- relevant PR feedback;
- clear failure ownership;
- documented local command equivalents;
- no hidden skipped checks.

Do not add paid services, external SaaS, provider calls, workers, Graphify,
credentials, or cleanup automation for this spike.

## Recommended Story Shape

If profiling justifies implementation, create a story with:

- current timing baseline;
- target improvement;
- exact tests/jobs affected;
- coverage preserved;
- local verification commands;
- CI verification expectation;
- rollback path if flakes increase.

## Recommended Next Step

Run the profiling spike only when Bob wants to spend local/CI time on runtime
measurement. Until then, keep this packet as the ready-to-run plan and do not
restructure CI from assumptions.
