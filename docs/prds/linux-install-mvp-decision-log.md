# Decision Log

## 2026-06-18

- Recovered Linux install PRD state from durable repo docs because no in-progress BMAD PRD workspace existed under `_bmad-output/planning-artifacts/prds`.
- Bound recovered PRD workspace to `_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-06-18/`.
- Treated `docs/linux-install/index.md`, `install-contract.md`, `one-command-bootstrap-plan.md`, `validation-matrix.md`, `goal-run-contract.md`, `release-gate-traceability.md`, and `remaining-gaps.md` as recovery sources.
- Preserved the v1 product boundary: Ubuntu 26.04+, existing non-root sudo user, local in-distro single bootstrap command, no SSH/remote/staged/manual fallback install method.
- Deferred epic/story generation until Bob confirms input document inclusion/exclusion, as required by the BMAD epics workflow.
- Recovery update: found `_bmad-output/planning-artifacts/epics.md` after outage with `stepsCompleted` marking prerequisite validation, epic design, story creation, and final validation complete.
- Recovery update: found `_bmad-output/planning-artifacts/linux-install-architecture.md` as the architecture input used by the epic/story artifact.
- Recovery update: corrected recovered BMAD planning artifact command references from the stale `pnpm run linux:bootstrap -- --plan/--verify-only` form to the verified `pnpm run linux:bootstrap --plan/--verify-only` form.
