# Mature Tool Decision - Local Source Inventory For Planning

Last updated: 2026-06-01

## Decision Status

Status: accepted with deferred custom code

## Capability Or Workflow Reviewed

Local source inventory for KNX read/planning workflows over the approved source root:

- `C:/Users/slaw_dawg/Kendall_Nxt`

The reviewed capability is inventory and classification support only. It does not approve source mutation, external sends, GitHub/remotes, local model processing, runtime deployment, credential handling, customer systems, production systems, or account/security workflows.

## Job To Be Done

Create a local, repeatable way to inspect the approved project source root for planning: file inventory, file-type mix, tracked/untracked comparison, and candidate source-class scoping before any operational pack or source-evidence workflow is designed.

## Research Questions

- Can mature local tools produce a useful source inventory without custom code?
- Which existing tools fit the profile, data-boundary plan, and local-first execution policy?
- What risks remain when the approved source root is broad?
- Is custom code justified now?
- What rollback or exit path exists if the chosen approach is insufficient?

## Options Considered

| Option | Fit | Risks | Status |
| --- | --- | --- | --- |
| `git ls-files` | Fits local Git source/review boundary and reports tracked source inventory | Ignores untracked files and does not classify sensitive content | Accepted |
| `rg --files --hidden` with exclusions | Fast deterministic local inventory across visible workspace files | Can include broad project material unless exclusions are maintained | Accepted |
| PowerShell `Get-ChildItem` and grouping | Built-in local fallback for file inventory and extension summaries | Slower and noisier than ripgrep for large trees | Accepted as fallback |
| Existing `.gitignore` rules | Helps exclude generated and personal files from Git-oriented inventory | Does not prove all sensitive material is excluded | Accepted as supporting control |
| Custom source indexer or classifier | Could produce richer reports later | Premature before source/evidence contract workflow defines required fields | Deferred |
| Local model classifier | Could classify text semantically later | Local model runtime and GPU availability are unresolved | Deferred |
| External LLM/provider classification | Could summarize or classify source content | Requires per-use approval and must not receive sensitive or ambiguous material | Blocked without explicit per-use approval and later safety review |

## Fit Against Execution Policy

Fit: pass with concerns

The accepted workflow uses mature local tools and deterministic local processing, matching layers 1 and 2 of the execution ladder. No custom code, local model, GPU, GitHub/remote workflow, or external provider is required.

Concerns remain because semantic classification and source-evidence validation are not solved by file inventory alone.

## Fit Against Data-Boundary Plan

Fit: pass with concerns

The approved source root may be used for read/planning workflows. Generated inventory artifacts may be written only under the approved storage root:

- `C:/Users/slaw_dawg/Kendall_Nxt/_bmad/memory/knx/runtime`

The workflow must not mutate source files. It must not use GitHub/remotes, external providers, customer/production systems, credentials, account/security material, or destructive actions.

## Local Evidence

- Git version: `2.52.0.windows.1`
- ripgrep version: `15.1.0`
- `git ls-files` tracked files: 2067
- `rg --files --hidden -g '!.git' -g '!_bmad-output'` visible files: 2067
- Top observed extensions:
  - `.md`: 1773
  - `.toml`: 99
  - `.py`: 87
  - `.yaml`: 50
  - `.csv`: 42
  - `.json`: 5
  - `.html`: 4

## Cost Posture

No new paid service, account, package, or install is required.

## Security And Privacy Posture

The accepted approach stays local and reads only the approved source root. It reduces planning uncertainty but does not prove that sensitive data is absent. Any workflow that opens, copies, summarizes, exports, sends, or mutates specific content still needs boundary and safety checks.

## Maintenance And Dependency Posture

Git, ripgrep, and PowerShell are already available in this workspace. This adds no new runtime dependency. If ripgrep is unavailable later, PowerShell file enumeration is the fallback.

## Licensing Or Usage Constraints

No new third-party package, account, service terms, or license acceptance is introduced by this decision.

## Recommendation

Use mature local inventory tools before custom source-indexing code:

- Use `git ls-files` for tracked source inventory.
- Use `rg --files --hidden -g '!.git' -g '!_bmad-output'` for local visible-file inventory.
- Use PowerShell grouping for extension and source-class planning summaries.
- Write generated inventory artifacts only under the approved KNX runtime storage root.

Do not build a custom indexer or classifier until `knx-source-evidence-contract` defines what source packet or inventory evidence must contain.

## Custom-Code Scope

Status: deferred

No custom code is accepted for this capability now.

Small custom glue may be reconsidered later for:

- formatting inventory output as source evidence,
- validating source packet fields,
- comparing inventory snapshots,
- producing deterministic reports under the approved storage root.

Custom code remains blocked for source mutation, external sends, GitHub/remotes, credential handling, customer/production systems, account/security workflows, or writes outside the approved storage root.

## Rollback Or Exit Path

If local inventory is insufficient, keep the raw Git/ripgrep output as audit evidence and route to `knx-source-evidence-contract` to define the missing evidence fields before custom tooling is reviewed again.

If the broad source root becomes too risky, narrow the allowed source roots through `knx-data-boundary-plan` before running further planning workflows.

## Evidence Links Or Local Source References

- `_bmad/memory/knx/profile.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/decisions/data-boundary-2026-06-01.md`
- Local evidence commands:
  - `git --version`
  - `rg --version`
  - `git ls-files`
  - `rg --files --hidden -g '!.git' -g '!_bmad-output'`

## Assumptions And Open Questions

Assumptions:

- The first concrete post-boundary capability is local source inventory for planning.
- The approved source root remains read/planning only.
- External provider use remains per-use approval only and is not needed for inventory.

Open questions:

1. Which source classes should be inventoried first for source-evidence contracts?
2. Should inventory artifacts be materialized under the runtime storage root now, or only after the source/evidence contract is updated?
3. Should the approved source root be narrowed before operational pack planning?

## Decision Sources

- Capability reviewed: inferred from the newly approved read/planning source boundary.
- Tool acceptance: local deterministic evidence and execution-policy-derived mature-tool-first rule.
- Custom-code deferral: execution-policy-derived and data-boundary-derived.
- External-provider block: profile-derived per-use approval policy and data-boundary-derived forbidden destinations.
