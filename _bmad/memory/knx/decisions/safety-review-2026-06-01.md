# Safety Review - Packaged KNX Governance Core

Last updated: 2026-06-01

## Review Status

Status: concerns

Target reviewed: packaged KNX governance core, with `.agents/skills/knx-setup` as the setup skill.

Review intent: determine whether the packaged governance core can be treated as safe for module setup and further release-readiness work.

## Governance Artifacts Read

- `_bmad/memory/knx/profile.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/source-evidence-contract.md`
- `_bmad/memory/knx/tool-evaluation.md`
- `_bmad/memory/knx/decisions/safety-review-2026-05-31.md`
- `_bmad/memory/knx/decisions/module-strategy-2026-05-31.md`
- `_bmad/memory/knx/decisions/governance-coordinator-2026-06-01.md`
- `skills/reports/module-validation-knx-2026-06-01.md`

Missing governance artifacts: none for this review scope.

## Target Artifacts Read

- `.agents/skills/knx-setup/SKILL.md`
- `.agents/skills/knx-setup/assets/module.yaml`
- `.agents/skills/knx-setup/assets/module-help.csv`
- `.agents/skills/knx-setup/scripts/merge-config.py`
- `.agents/skills/knx-setup/scripts/merge-help-csv.py`
- `.agents/skills/knx-setup/scripts/cleanup-legacy.py`

## Blockers

No safety blockers found for governance-core setup.

The packaged core does not approve operational source intake, source mutation, external-provider use, customer/production access, credential handling, account/security changes, or live runtime assistant state.

## Concerns

1. Storage root and allowed source roots remain unresolved.
   - Impact: operational workflows still cannot create real source packets, source indexes, source mutation, or live runtime state.
   - Severity: concern.
   - Source: profile, data-boundary plan, source/evidence contract.

2. Concrete synthetic fixture files are still not created.
   - Impact: the packaged module validates structurally, but future automated validators do not yet have positive and negative fixture examples.
   - Severity: concern.
   - Source: source/evidence contract and module validation report.

Resolved concern:

- Setup cleanup guidance now supports both `{project-root}/.agents/skills` for Codex-first installs and `{project-root}/.claude/skills` for Claude-first installs. If both exist, setup guidance prefers `.agents/skills` unless the user explicitly targets Claude.

## Notes

- Module validation passed with zero structural findings.
- `knx-setup` writes module configuration and help registry entries; this is expected setup behavior.
- `merge-config.py` and `merge-help-csv.py` scope updates to config and module-help files.
- `cleanup-legacy.py` verifies installed skills before removing legacy directories when `--skills-dir` is provided.
- No script sends data externally, accesses credentials, or touches customer/production systems.

## Evidence Coverage Required

Before release-ready packaging:

- Create concrete synthetic source/evidence fixture files.
- Run module validation after any setup-skill text or script changes.
- Run safety validation again if setup cleanup behavior changes.

Before operational packs:

- Record storage root approval.
- Record allowed source roots and permitted operations.
- Record Git/GitHub, local model/GPU, and external-provider decisions if those packs are included.
- Add source packets, work traces, validation evidence, and user-input-required records for operational workflows.

## Data-Boundary Fit

Fit: concerns

The packaged setup skill fits the current data-boundary plan for governance setup because it writes configuration and help registry files only. It does not approve operational source intake or live runtime state. Concerns remain for unresolved storage and source roots.

## Execution-Policy Fit

Fit: pass with concerns

The packaged core uses mature BMad setup workflow and deterministic local scripts. It does not require local model runtime, GPU, external providers, or custom operational logic. The setup scripts are local glue for configuration and registry merging, which fits the accepted governance-core scope.

## Source/Evidence-Contract Fit

Fit: concerns

The packaged core has traceable governance decisions and a module validation report. Concrete fixture records and validation evidence artifacts are still incomplete, so release-readiness remains with concerns.

## Required User Decisions

1. Should concrete synthetic fixtures be created before release packaging?
2. What storage root and source roots should be approved before any operational pack work?
3. Who can approve risk score `9` waivers?

## Recommended Fixes Or Next Workflow

Recommended next workflow: create concrete synthetic fixtures through `knx-source-evidence-contract` or a narrowly scoped fixture workflow.

The installed-skills-directory portability concern is resolved. BMad Module Builder validation was rerun after the change and passed with 0 findings.

## Residual Risks

- Manual Markdown governance records can drift until concrete validators and fixtures exist.
- Operational packs remain blocked until storage/source/provider decisions are recorded.

## Decision Sources

- Review status: local safety review of packaged core.
- No blockers finding: target artifact review, data-boundary-derived, execution-policy-derived.
- Concerns: profile-derived, data-boundary-derived, source/evidence-contract-derived.
- Module validation evidence: `skills/reports/module-validation-knx-2026-06-01.md`.
- Portability fix evidence: `.agents/skills/knx-setup/SKILL.md` and `.agents/skills/knx-setup/scripts/cleanup-legacy.py`.

---

# Safety Review - Synthetic Fixture Pack

Last updated: 2026-06-01

## Review Status

Status: concerns

Target reviewed: `_bmad/memory/knx/fixtures/synthetic/first-fixture-pack.json`

Review intent: determine whether the concrete synthetic fixture pack satisfies the KNX source/evidence contract and can be used as safe local fixture evidence for future validators and safety reviews.

## Governance Artifacts Read

- `_bmad/memory/knx/profile.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/source-evidence-contract.md`
- `_bmad/memory/knx/decisions/safety-review-2026-06-01.md`
- `_bmad/memory/knx/daily/2026-06-01.md`

Missing governance artifacts: none for this review scope.

## Target Artifacts Read

- `_bmad/memory/knx/fixtures/synthetic/first-fixture-pack.json`

Deterministic local checks performed:

- Parsed fixture pack JSON with PowerShell `ConvertFrom-Json`.
- Checked required first-pack fixture category coverage.
- Checked required synthetic-only statements.
- Checked expected validation result presence.
- Checked expected failed rules for negative fixtures.
- Searched the fixture pack for secret-like assignments and private key markers.

## Blockers

No safety blockers found for the synthetic fixture pack.

The pack is stored under `_bmad/memory/knx/fixtures/synthetic`, is labeled synthetic-only, and does not request execution of external sends, installs, account changes, source mutation, live runtime state creation, destructive actions, credential handling, customer-system access, or production-system access.

## Concerns

1. The broader KNX governance contracts remain provisional.
   - Impact: this fixture pack is safe for fixture and validator testing, but it does not approve operational source intake, live runtime state, source mutation, external providers, customer/production access, or writes outside approved KNX memory boundaries.
   - Severity: concern.
   - Source: profile, data-boundary plan, execution policy, and source/evidence contract.

2. Referenced negative validation evidence IDs are fixture references, not standalone validation evidence records.
   - Impact: acceptable for a first synthetic fixture pack, but future automated validators should either materialize these expected validation evidence examples or explicitly treat them as expected-output IDs.
   - Severity: concern.
   - Source: target fixture pack and source/evidence contract link rules.

3. The profile and data-boundary records still say Git is not detected, while this workspace now has a Git repository.
   - Impact: not relevant to fixture safety because Git is not used as live/runtime state, but governance memory should be refreshed before Git/GitHub decisions are relied on.
   - Severity: concern.
   - Source: profile, data-boundary plan, and local repository state.

## Notes

- Fixture count: 8.
- Required first-pack categories are present:
  - `valid-source-packet`
  - `valid-work-trace`
  - `valid-validation-evidence`
  - `valid-user-input-required`
  - `missing-source-negative`
  - `external-action-negative`
  - `unsupported-inference-negative`
  - `forbidden-destination-negative`
- All fixture entries include `synthetic_only_statement`.
- All fixture entries include `expected_validation_result`.
- All negative fixtures include `expected_failed_rules`.
- All fixture entries set `forbidden_content_check` to `pass`.
- Secret-pattern search found no key material or secret-like assignments in the fixture pack.

## Evidence Coverage Required

Before release-ready validator packaging:

- Add or generate validator logic that checks this pack against the source/evidence contract.
- Decide whether negative fixture validation evidence IDs should become concrete validation evidence examples.
- Rerun module validation after validator or setup-skill changes.
- Rerun safety validation if fixture categories, storage location, execution behavior, or generated validator behavior changes.

Before operational packs:

- Record storage root approval.
- Record allowed source roots and permitted operations.
- Record Git/GitHub boundary decisions now that this folder has been initialized as a Git repository.
- Record local model/GPU and external-provider decisions if those packs are included.
- Keep operational source packets, customer/production data, credentials, account/security material, and external sends out of fixture packs.

## Data-Boundary Fit

Fit: pass with concerns

The fixture pack fits the current data-boundary plan for synthetic fixtures because it lives under `_bmad/memory/knx/fixtures/synthetic`, uses synthetic-only statements, and does not create live/runtime state. Concerns remain for unresolved storage root, allowed source roots, and stale Git detection in governance memory.

## Execution-Policy Fit

Fit: pass

The review used deterministic local parsing and text search only. The fixture pack itself does not require local model runtime, GPU, custom operational logic, external providers, or source mutation.

## Source/Evidence-Contract Fit

Fit: pass with concerns

The pack covers the required first fixture categories and follows fixture safety rules. Negative fixtures clearly mark expected `FAIL` or `CONCERNS` outcomes and expected failed rules. The remaining concern is that some referenced negative validation evidence IDs are expected-output references rather than full validation evidence records.

## Required User Decisions

1. Should future validator work materialize standalone validation evidence examples for each negative fixture?
2. What storage root and source roots should be approved before any operational pack work?
3. Should the profile and data-boundary records be updated now that this project has been initialized as a Git repository?
4. Who can approve risk score `9` waivers?

## Recommended Fixes Or Next Workflow

Recommended next workflow: `bmad-module-builder` Validate Module if the fixture pack is now part of release-readiness evidence.

Recommended follow-up governance update: refresh `knx-profile-setup` or `knx-data-boundary-plan` for the Git boundary before relying on Git/GitHub workflow decisions.

## Residual Risks

- Manual fixture records can drift from future validator behavior until automated checks exist.
- Operational packs remain blocked until storage/source/provider decisions are recorded.
- Git is source/review state only; it is still not approved as live assistant runtime or deployment state.

## Decision Sources

- Review status: local safety review of the synthetic fixture pack.
- No blockers finding: target artifact review, data-boundary-derived, execution-policy-derived, source/evidence-contract-derived.
- Concerns: profile-derived, data-boundary-derived, source/evidence-contract-derived, and local repository-state observation.
- Fixture coverage evidence: `_bmad/memory/knx/fixtures/synthetic/first-fixture-pack.json`.
- Deterministic checks: local JSON parse, fixture category coverage check, fixture field presence check, and secret-pattern text search.
