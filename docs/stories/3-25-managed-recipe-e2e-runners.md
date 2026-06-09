# Story 3.25: Managed Recipe E2E Runners

Date: 2026-06-09
Status: ready for review

## Goal

Add focused, owned-lifecycle browser verification commands for the dashboard managed coverage intake templates.

## Scope

- Add `pnpm run test:e2e:dashboard:managed`.
- Add `pnpm run test:e2e:dashboard:managed:mobile`.
- Add focused runner scripts for `supervisor-managed-recipe.spec.ts` and `supervisor-managed-mobile-recipe.spec.ts`.
- Keep both runners on the shared dashboard e2e lifecycle helper.
- Use a Chromium-backed phone profile for the managed mobile recipe smoke.
- Surface the commands in the verification readiness report and dashboard e2e report.
- Add runtime evidence export and architecture/story references.

## Safety

This is verification infrastructure only. It does not approve:

- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- network access,
- credential access.

## Acceptance

- Both managed recipe focused commands exist.
- Both commands use the shared lifecycle helper.
- The managed mobile recipe smoke uses a Chromium-backed phone profile.
- Verification readiness and dashboard e2e reports list both managed recipe commands.
- Runtime evidence export references this story as git-backed evidence.
- Both managed recipe focused checks pass.
- `pnpm run check` passes.

## Verification

- `pnpm run check:docs`
- focused supervisor integration tests for verification/dashboard e2e reports and runtime export references
- `pnpm run test:e2e:dashboard:managed`
- `pnpm run test:e2e:dashboard:managed:mobile`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
