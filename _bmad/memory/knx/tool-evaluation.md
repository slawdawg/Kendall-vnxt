# KNX Tool Evaluation

Last updated: 2026-05-31

## Review Status

Status: accepted with deferred custom code

Capability reviewed: KNX governance foundation memory, policy, boundary, and decision-record workflow.

Decision: use mature local workflow primitives already inside the project boundary before creating custom code.

## Job To Be Done

Maintain a local-first, auditable KNX governance foundation that records setup profile, execution policy, data boundaries, tool decisions, daily logs, and future source evidence contracts without sending data externally or creating live runtime state.

## Research Questions

- Can the base governance workflow be handled with existing local files and deterministic checks?
- Which mature or already-available tools fit the current partial profile and provisional boundary plan?
- What custom code, if any, is justified before storage root and source roots are resolved?
- What exit path exists if the local Markdown memory pattern becomes insufficient?

## Options Considered

| Option | Fit | Risks | Status |
| --- | --- | --- | --- |
| Markdown memory files under `_bmad/memory/knx` | Fits current allowed setup storage and is easy to inspect, diff, and hand edit | Manual consistency checks; no schema enforcement yet | Accepted |
| BMad/KNX skill workflows | Fits current governance process and keeps decisions explicit | Depends on skill discipline and memory quality | Accepted |
| Deterministic local shell checks such as `Select-String`, `Get-ChildItem`, and file existence checks | Fits local-first and deterministic-first policy | Limited semantic validation | Accepted |
| Git/GitHub workflow | Useful for source/review later | Current directory is not a Git repo; Git/GitHub is not runtime state | Deferred |
| Local scripts for schema or contract validation | Could improve repeatability | Custom code before boundaries are complete; must stay small and local | Deferred |
| Local model runtime or GPU-backed processing | Could help later with summarization or classification | Availability and boundaries are unresolved | Deferred |
| External LLM/GPT/provider processing | Could help with analysis later | Last-resort only; no standing send approval; sensitive classes forbidden | Blocked without explicit approval/policy |
| OneDrive, Microsoft 365, sync providers, app data directories, or external storage | Could be useful deployment/storage choices later | Not approved in current boundary plan | Deferred |

## Fit Against Execution Policy

- Mature workflow first: accepted via BMad/KNX skill workflows and Markdown memory.
- Deterministic local processing second: accepted via local file checks and contract-section checks.
- Local compute/model path: deferred because GPU/local model runtime is unknown.
- Custom glue code: deferred until a concrete validation or import/export gap is identified and boundaries allow it.
- External provider use: blocked without explicit approval or recorded policy for the specific send.

Source: execution-policy-derived from `execution-policy.md`.

## Fit Against Data-Boundary Plan

- Writes remain inside `_bmad/memory/knx`, which is approved for setup memory.
- No live runtime/deployment state is created.
- No source roots are approved for mutation.
- No credential, customer, production, account/security, email/calendar, or attachment handling is approved.
- No external sends are approved.

Source: data-boundary-derived from `data-boundaries.md`.

## Cost Posture

Current accepted approach has no new paid service dependency and no new install requirement.

Source: local review; no external research performed.

## Security And Privacy Posture

Accepted approach keeps governance data local in the project memory folder and avoids credentials, account/security settings, customer systems, production systems, and external providers.

Source: profile-derived and data-boundary-derived.

## Maintenance And Dependency Posture

Accepted approach depends on plain Markdown files and existing local shell/file tooling. This is low dependency but requires explicit validation checks and decision records to prevent drift.

Source: local review.

## Licensing Or Usage Constraints

No new third-party package, service, license, or account acceptance is introduced by the accepted approach.

Source: local review.

## Recommendation

Use the existing BMad/KNX skill workflow plus Markdown memory files as the mature local governance foundation.

For now, allow deterministic local file and section checks. Defer custom schema validators, source indexers, sync integrations, GitHub automation, local model runtimes, and external providers until the profile and data-boundary open questions are resolved or a specific capability review justifies them.

## Custom-Code Scope

Current status: deferred.

Small custom glue may be considered later for:

- Contract validation of KNX memory files.
- Source packet validation.
- Synthetic fixture validation.
- Import/export formatting inside approved storage.

Custom code remains blocked for:

- Unapproved source roots.
- Unapproved storage destinations.
- Credentials, account/security material, customer systems, or production systems.
- External sends without a matching approval or policy.

## Rollback Or Exit Path

If Markdown memory becomes insufficient, create a later mature-tool review for structured validation or storage. Keep the current Markdown files as the source of record until a replacement has:

- A recorded storage boundary.
- A migration plan.
- A rollback path back to Markdown.
- Evidence that it does not require external sends or unapproved runtime state.

## Evidence Links Or Local Source References

- `_bmad/memory/knx/profile.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/daily/2026-05-31.md`

## Assumptions And Open Questions

Assumptions:

- The reviewed capability is the KNX governance foundation because no narrower capability was specified.
- External research is not needed for the base governance foundation review.

Open questions:

1. What storage root should be approved for live state and generated artifacts?
2. Which source roots should be approved?
3. Should Git/GitHub be enabled for source and review?
4. Should local model/runtime or GPU options be reviewed after availability is confirmed?
5. Which specific operational capability should receive the next mature-tool review?

## Decision Sources

- Capability reviewed: inferred from workflow sequence.
- Accepted mature workflow: local review, profile-derived, execution-policy-derived, data-boundary-derived.
- Custom-code deferral: execution-policy-derived and data-boundary-derived.
- External-provider block: execution-policy-derived.
- Storage and source limitations: profile-derived and data-boundary-derived.

---

# KNX Mature Tool Review - Local Git Source Review

Last updated: 2026-06-01

## Review Status

Status: accepted with deferred remote workflows and deferred custom code

Capability reviewed: local Git source control and source/review workflow after the KNX Git boundary refresh.

Decision: use the mature local Git CLI already available in the project for source control, local review, diff/status inspection, and commit history. Defer GitHub, Git remotes, PRs, issues, actions, releases, deployments, and remote review workflows until a concrete remote workflow is proposed and a boundary decision records the remote and allowed operations.

## Job To Be Done

Keep the project under local source control and allow auditable local review of KNX governance artifacts without creating live runtime state, sending data externally, mutating unapproved source systems, or relying on GitHub/remote services.

## Research Questions

- Can the immediate source/review need be handled by mature local Git tooling?
- Which Git-related options fit the current install profile, data-boundary plan, and local-first execution policy?
- What GitHub or remote functionality remains blocked or deferred?
- Is any custom code justified for Git workflows now?
- What rollback or exit path exists if a future remote workflow is not approved?

## Options Considered

| Option | Fit | Risks | Status |
| --- | --- | --- | --- |
| Local Git CLI for status, diff, add, commit, branch inspection, and history | Fits local source/review boundary and deterministic local processing | Commits can capture inappropriate files if ignore rules or review discipline fail | Accepted for source/review only |
| Existing `.gitignore` and `.gitattributes` repository hygiene | Fits local source-control setup and reduces accidental local/user config tracking | Does not replace source/content review before commit | Accepted as local hygiene |
| GitHub or Git remote workflows | Could support collaboration later | Remote boundary, external destination, PR/issues/actions/releases, and remote review workflows are unresolved | Deferred |
| GitHub Actions or release/deployment workflows | Could automate validation later | Would treat remote service as execution/deployment surface; not approved | Blocked until later boundary and execution-policy decisions |
| Custom Git automation or commit/release scripts | Could streamline repeated steps | Custom code is unnecessary for current local review and could mutate source or remote state without a mature-tool need | Deferred |

## Fit Against Execution Policy

Fit: pass with concerns

Local Git CLI is a mature local tool and deterministic local workflow. It fits layers 1 and 2 of the execution ladder for source/review. No local model, GPU, external provider, or custom operational code is required.

Concerns remain for any workflow that would push, pull, create PRs/issues, invoke GitHub Actions, create releases, deploy, or use a remote provider. Those require later explicit boundary and policy decisions.

## Fit Against Data-Boundary Plan

Fit: pass with concerns

The current data-boundary plan accepts local Git for source control, local review, diff/status inspection, and commit history inside `C:/Users/slaw_dawg/Kendall_Nxt`. GitHub and Git remotes remain unresolved. Git and GitHub remain forbidden as live assistant runtime or deployment state.

## Cost Posture

Local Git CLI use has no new paid service dependency and no new account requirement.

GitHub or remote services may add account, organization, billing, retention, privacy, or policy considerations later; not reviewed or approved here.

## Security And Privacy Posture

Local Git keeps repository metadata and commits inside the local project boundary. The main risk is accidental tracking of local/user config, secrets, customer data, production data, or other forbidden content.

Current mitigations:

- `_bmad/config.user.yaml` is ignored.
- `_bmad/custom/config.user.toml` is ignored.
- Environment and key-like file patterns are ignored.
- KNX fixture and memory rules forbid credentials, account/security material, customer systems, and production systems.

This review did not inspect every staged file for sensitive content and does not approve committing or pushing sensitive material.

## Maintenance And Dependency Posture

Local Git is a mature, established source-control tool already present in the workflow. It requires no new package installation and has a clear rollback path through local commits, diffs, and branches.

## Licensing Or Usage Constraints

No new third-party package, service license, account, or remote terms are introduced by local Git use.

GitHub or other remote hosting terms are out of scope until a remote workflow is proposed.

## Recommendation

Use local Git CLI for source/review only.

Do not enable GitHub, remotes, PRs, issues, actions, releases, deployments, remote review workflows, or Git-based runtime/deployment state until:

- a concrete remote workflow is proposed,
- the Git remote is recorded,
- `knx-data-boundary-plan` accepts the remote boundary,
- `knx-execution-policy` confirms the execution layer,
- `knx-safety-validation-review` reviews the target workflow.

## Custom-Code Scope

Current status: deferred.

No custom Git automation is justified for the current local source/review need. Future custom code may be considered only for narrow, deterministic validation/reporting inside approved local boundaries after mature Git commands and existing BMad workflows are insufficient.

Custom code remains blocked for:

- unapproved source roots,
- unapproved storage destinations,
- source mutation without approval,
- GitHub/remotes without boundary approval,
- credentials, account/security material, customer systems, or production systems,
- external sends without approval or policy.

## Rollback Or Exit Path

If remote workflows are not approved, continue with local Git only.

If local Git use becomes inappropriate for KNX memory, stop using Git for the affected workflow and keep `_bmad/memory/knx` Markdown records as the governance source of record until a replacement boundary is approved.

## Evidence Links Or Local Source References

- `_bmad/memory/knx/profile.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/decisions/data-boundary-2026-06-01.md`
- Local Git detection: repository `C:/Users/slaw_dawg/Kendall_Nxt`, branch `main`, no remote configured.

## Assumptions And Open Questions

Assumptions:

- The reviewed capability is local Git source/review because no narrower capability was specified and the latest governance trail recommended mature-tool review only after a concrete capability or Git/GitHub workflow is proposed.
- External research is not needed for local Git CLI suitability.

Open questions:

1. Should a Git remote be recorded for source/review work?
2. Should GitHub PRs or issues be allowed later?
3. Should a pre-commit or local validator workflow be reviewed as a separate capability?
4. What storage root should be approved for live state and generated artifacts?
5. Which source roots should be approved for reading, planning, or mutation?

## Decision Sources

- Capability reviewed: inferred from the latest profile and data-boundary Git refresh.
- Local Git acceptance: data-boundary-derived and local Git detection.
- Remote workflow deferral: data-boundary-derived and profile-derived.
- Custom-code deferral: execution-policy-derived and data-boundary-derived.
- External-provider and remote service caution: execution-policy-derived and profile-derived.

---

# KNX Mature Tool Review - Local Commit Readiness Validation

Last updated: 2026-06-01

## Review Status

Status: accepted; whitespace concerns resolved

Capability reviewed: local commit-readiness validation before any initial commit, GitHub/remote workflow, or operational pack work.

Decision: use mature local tools already available in the workspace for commit-readiness checks. Do not add custom hooks, custom validators, GitHub Actions, remote services, or external providers yet.

## Job To Be Done

Provide a local-only, repeatable way to decide whether the currently staged KNX/BMad project is ready for a local commit without sending data externally, approving GitHub/remotes, creating live runtime state, or introducing custom automation.

## Research Questions

- Which mature local tools can check commit readiness now?
- Do those checks fit the current profile, execution policy, and data-boundary plan?
- What findings block or caution against a local commit?
- Is custom code or hook automation justified now?
- What is the rollback or exit path if the repository is not ready?

## Options Considered

| Option | Fit | Risks | Status |
| --- | --- | --- | --- |
| `git status --short` and `git ls-files` | Fits local Git source/review boundary | Does not inspect content quality by itself | Accepted |
| `git diff --cached --check` | Mature local check for whitespace/conflict-marker issues before commit | Reports broad imported artifact whitespace issues that may be noisy | Accepted with concerns |
| `rg` secret-pattern scan over tracked workspace excluding `.git` and `_bmad-output` | Deterministic local content scan, no external send | Pattern scan is not a complete secret detector | Accepted with concerns |
| BMad Module Builder validation for KNX | Existing local module validation command | Only validates module structure, not all staged files | Accepted |
| Custom pre-commit hook or custom validator script | Could standardize checks later | Custom automation is premature and could mutate source workflow expectations | Deferred |
| GitHub Actions or remote CI | Could automate later | Remote/GitHub workflows are not approved | Blocked until later boundary and safety review |

## Fit Against Execution Policy

Fit: pass with concerns

The accepted checks use mature local tools and deterministic local processing. No local model, GPU, custom code, external provider, or remote service is needed.

Concerns remain because custom hook automation is deferred and Git identity is not configured, so a local commit cannot be completed without user configuration.

## Fit Against Data-Boundary Plan

Fit: pass with concerns

The checks operate inside the local repository and approved KNX memory area. They do not approve GitHub/remotes, source mutation beyond local source-control staging/review, operational source intake, live runtime state, customer/production access, credentials, or external sends.

## Local Check Results

- Local Git repository: detected on branch `main`.
- Git remote: none configured.
- Staged files: 2064.
- Untracked, non-ignored files: 2.
- Unstaged modified files: 7.
- Ignored files include `_bmad-output/`, `_bmad/config.user.yaml`, and `_bmad/custom/config.user.toml`.
- `git diff --cached --check`: passed after whitespace-only cleanup in imported `.agents`, `.claude`, and `_bmad/_config` artifacts.
- Secret-pattern scan: no matches for private key markers or simple secret assignments in the scanned workspace.
- KNX module validation: pass, 0 findings.
- Git user identity: configured locally as `Bob <axeshock@gmail.com>`.

## Cost Posture

No new service, package, account, or install is required.

## Security And Privacy Posture

The accepted checks are local-only. The secret-pattern scan lowers risk but does not prove absence of all sensitive data. Commit content should still be reviewed before sharing or publishing.

## Maintenance And Dependency Posture

The accepted workflow depends on existing Git, ripgrep, PowerShell, Python, and BMad module validation already present in the workspace. No new maintenance burden is introduced.

## Licensing Or Usage Constraints

No new license, service terms, or account agreements are introduced.

## Recommendation

Use this local commit-readiness check set before any initial commit:

- `git status --short --ignored`
- `git diff --cached --check`
- local secret-pattern scan with `rg`
- KNX module validation command
- Git identity check

Do not proceed to GitHub/remote workflows until a remote boundary and safety review are recorded.

Before committing, review the staged scope and any remaining unstaged governance edits. Remote/GitHub workflows remain unapproved.

## Custom-Code Scope

Status: deferred

No custom pre-commit hook, custom validator, or local automation script is accepted in this decision.

## Rollback Or Exit Path

Keep the repository local. If commit readiness is not acceptable, leave changes staged/uncommitted or unstage selected files using normal Git source-control review. Do not push or publish.

## Evidence Links Or Local Source References

- `_bmad/memory/knx/profile.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/decisions/data-boundary-2026-06-01.md`
- `_bmad/memory/knx/decisions/mature-tool-git-2026-06-01.md`
- `skills/reports/module-validation-knx-2026-06-01.md`

## Assumptions And Open Questions

Assumptions:

- The next concrete capability should stay local because remote/GitHub workflows are unresolved.
- Commit-readiness validation is a source/review capability, not operational source intake.

Open questions:

1. Should the initial commit scope be narrowed to KNX governance artifacts only?
2. Should a future local pre-commit hook be reviewed as a separate capability?

## Decision Sources

- Coordinator routing from current project state.
- Local Git detection and status checks.
- Data-boundary plan and local Git source/review decision.
- Existing KNX module validation report and fresh validator run.
- Execution-policy mature-tool-first and deterministic-first rules.

---

# KNX Mature Tool Review - Local Source Inventory For Planning

Last updated: 2026-06-01

## Review Status

Status: accepted with deferred custom code

Capability reviewed: local source inventory for read/planning workflows over the approved source root `C:/Users/slaw_dawg/Kendall_Nxt`.

Decision: use existing mature local tools for source inventory before custom code.

## Job To Be Done

Support KNX planning by inventorying the approved local source root: tracked files, visible files, file-type mix, and candidate scope for later source/evidence contracts.

## Options Considered

| Option | Fit | Risks | Status |
| --- | --- | --- | --- |
| `git ls-files` | Mature local tracked-file inventory | Ignores untracked files | Accepted |
| `rg --files --hidden` with exclusions | Fast local visible-file inventory | Needs disciplined exclusions | Accepted |
| PowerShell `Get-ChildItem` and grouping | Built-in fallback | Noisier and slower | Accepted as fallback |
| Custom source indexer/classifier | Could help later | Premature before source/evidence fields are defined | Deferred |
| Local model classifier | Could help later | Local model/GPU unresolved | Deferred |
| External provider classification | Could help later | Requires per-use approval and safety review | Blocked without approval |

## Fit Against Execution Policy

Fit: pass with concerns

The accepted options use mature local tools and deterministic processing. No custom code, model runtime, GPU, GitHub/remote workflow, or external provider is required.

## Fit Against Data-Boundary Plan

Fit: pass with concerns

The workflow stays inside the approved read/planning source root and writes generated artifacts only under the approved KNX runtime storage root if materialized. It does not approve source mutation or external destinations.

## Local Evidence

- Git version: `2.52.0.windows.1`
- ripgrep version: `15.1.0`
- Tracked files from `git ls-files`: 2067
- Visible files from `rg --files --hidden -g '!.git' -g '!_bmad-output'`: 2067
- Largest observed extensions: `.md`, `.toml`, `.py`, `.yaml`, `.csv`

## Recommendation

Use `git ls-files`, `rg --files`, and PowerShell summaries for the first local source inventory. Defer custom inventory or classifier code until `knx-source-evidence-contract` defines the required source packet and validation evidence fields.

## Custom-Code Scope

Status: deferred

No custom code is accepted now.

## Rollback Or Exit Path

If inventory output is insufficient, route to `knx-source-evidence-contract` before custom tooling. If the approved source root is too broad, narrow it through `knx-data-boundary-plan`.

## Evidence Links Or Local Source References

- `_bmad/memory/knx/decisions/mature-tool-source-inventory-2026-06-01.md`
- `_bmad/memory/knx/profile.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/data-boundaries.md`

---

# KNX Mature Tool Review - Optional Source Evidence Validator

Last updated: 2026-06-01

## Review Status

Status: accepted with narrow custom glue; external/package dependencies deferred

Capability reviewed: deterministic local validator implementation options for the future KNX optional source/evidence pack.

Decision: use Python 3.12 standard library as the primary implementation path, supported by PowerShell JSON parsing and ripgrep text scans. Defer `jsonschema`, Pydantic, Zod, Ajv, local model/GPU validation, external providers, GitHub Actions, and remote CI.

## Job To Be Done

Provide a local, repeatable way to validate KNX source/evidence fixtures and future optional pack artifacts without changing governance-core scope.

Initial checks should cover:

- fixture JSON parsing,
- required fixture categories,
- synthetic-only statements,
- expected validation results,
- expected failed rules for negative fixtures,
- required fields by artifact type,
- controlled vocabulary values,
- source mutation approval gating,
- approved-storage-root checks for source inventory evidence,
- external-send flags,
- risk score `9` waiver rules.

## Options Considered

| Option | Fit | Risks | Status |
| --- | --- | --- | --- |
| PowerShell `ConvertFrom-Json` and path checks | Already available and useful for quick deterministic checks | Less maintainable for richer reusable rule sets | Accepted as supporting check |
| Python 3.12 standard library | Already available, deterministic, Windows-friendly, no new dependency | Requires small KNX-specific custom glue | Accepted as primary path |
| Existing BMad Module Builder validator pattern | Proven local validator pattern | Checks module structure, not KNX evidence artifacts | Accepted as pattern only |
| ripgrep text scans | Already available for heuristic forbidden-content scans | Not proof of no sensitive material | Accepted as supporting check |
| `jsonschema` package | Mature formal schema validator | New dependency, no project manifest, insufficient for cross-artifact policy rules alone | Deferred |
| Pydantic | Mature Python validation library | New dependency and heavier model layer than current need | Deferred |
| Zod/Ajv | Mature JS/TS validation libraries | No JS project/package manifest for this optional pack | Deferred |
| Local model or external LLM validation | Could classify semantics later | Local model/GPU unresolved; external sends require approval and safety review | Blocked for this capability |

## Fit Against Execution Policy

Fit: pass with concerns

The accepted path uses mature local tools and deterministic local processing first. Narrow custom glue is justified only for KNX-specific validation rules that generic parsers do not provide.

## Fit Against Data-Boundary Plan

Fit: pass with concerns

The validator may read KNX governance records and synthetic fixtures. It may write findings only under approved KNX memory or approved runtime storage. It must not mutate source roots, materialize inventory outside approved storage, send externally, access credentials, or process customer/production/account-security material.

## Cost Posture

No new paid service, account, package, or install is required for the accepted path.

## Security And Privacy Posture

The accepted approach stays local and starts with metadata and synthetic fixtures. Secret-pattern scans remain heuristics, not proof that sensitive data is absent.

## Maintenance And Dependency Posture

Keeping the first validator dependency-free improves installability and rollback. Package-based schema validation can be reviewed later if stdlib checks become too brittle.

## Licensing Or Usage Constraints

No new license, service terms, package install, or account agreement is introduced.

## Recommendation

Plan the optional source/evidence pack validator as a small Python stdlib script with stdlib tests. Do not write code until the target path, input/output contract, and safety-review target are named.

## Custom-Code Scope

Status: accepted for narrow deterministic local glue

Allowed:

- local Python stdlib validation script,
- stdlib tests,
- local structured findings,
- local reports under approved KNX memory/storage.

Blocked:

- source mutation,
- GitHub/remotes,
- external sends,
- local model/GPU processing,
- credentials/account-security/customer/production access,
- writes outside approved storage,
- governance-core implementation changes,
- package dependencies without later approval.

## Rollback Or Exit Path

If the first validator is insufficient, keep Markdown contracts and fixture packs as source of record and run another mature-tool review before adding schema packages or broader automation.

## Evidence Links Or Local Source References

- `_bmad/memory/knx/decisions/mature-tool-source-evidence-validator-2026-06-01.md`
- `_bmad/memory/knx/decisions/custom-code-source-evidence-validator-2026-06-01.md`
- `_bmad/memory/knx/source-evidence-contract.md`
- `_bmad/memory/knx/fixtures/synthetic/first-fixture-pack.json`
- `_bmad/memory/knx/decisions/module-strategy-2026-05-31.md`
- Local evidence: Python 3.12.10, Git 2.52.0, ripgrep 15.1.0.

## Assumptions And Open Questions

Assumptions:

- First validator target is KNX governance/evidence metadata and synthetic fixtures, not arbitrary source content.
- Optional source/evidence pack remains separate from governance core.

Open questions:

1. Where should optional pack scripts live?
2. Should negative validation evidence examples be materialized before code?
3. Should the first validator output JSON, Markdown, or both?

## Decision Sources

- Capability reviewed: user-approved optional source/evidence pack next step.
- Tool acceptance: local evidence and deterministic-first policy.
- Custom glue acceptance: KNX-specific cross-artifact validation rules.
- Dependency deferral: local-first, no dependency manifest, custom-code-last policy.

---

# KNX Mature Tool Review - Codex Workspace Orchestration

Last updated: 2026-06-10

## Review Status

Status: accepted with narrow custom glue

Capability reviewed: mobile/SSH-friendly Codex workspace orchestration for starting, resuming, finishing, PR-ing, and cleaning up Git worktrees on a Windows VM without new paid services or routine GitHub Actions usage.

## Job To Be Done

Reduce friction around Codex mobile and SSH development by making worktree creation, branch naming, task tracking, PR creation/status checks, and cleanup conversational and safe.

## Options Considered

| Option | Fit | Risks | Status |
| --- | --- | --- | --- |
| Native `git worktree` | Mature local worktree lifecycle | Needs naming/cleanup policy | Accepted |
| GitHub CLI `gh pr` | Mature PR create/status interface | Requires auth and explicit remote operations | Accepted |
| Local hooks and GitHub branch protection | Strong guardrails | Local hooks are not universal | Accepted |
| Git Town | Mature branch lifecycle automation | Branch-centric, not task-manifest/worktree-centric | Deferred optional pilot |
| GitHub Actions | Could automate remote cleanup signals | Consumes finite Actions minutes | Rejected for routine orchestration |
| Paid external platforms | Could provide control plane | Adds cost and tool-dependent hygiene | Rejected for core |
| Thin repo-owned custom glue | Solves remaining task/workspace protocol gaps | Must stay deterministic and small | Accepted narrowly |

## Recommendation

Adopt a Codex Workspace Protocol using Git worktree, GitHub CLI, local hooks, branch protection, `AGENTS.md`, and a thin local task-manifest script layer. Keep Git hygiene repo-owned and portable. Defer Git Town to a later optional pilot if branch workflow friction remains.

## Evidence Links Or Local Source References

- `decisions/mature-tool-codex-workspace-orchestration-2026-06-10.md`
- https://git-scm.com/docs/git-worktree
- https://cli.github.com/manual/gh_pr_create
- https://cli.github.com/manual/gh_pr_status
- https://www.git-town.com/commands/hack
- https://github.com/git-town/git-town
