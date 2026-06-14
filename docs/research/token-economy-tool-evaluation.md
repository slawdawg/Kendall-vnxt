# Token Economy Tool Evaluation Plan

Date: 2026-06-13
Status: evaluation guidance

## Purpose

Define how Kendall_Nxt should evaluate token-reduction tools before adopting
any runtime behavior, compression layer, cache, or prompt cleanup automation.

## Evaluation Principles

- Measure before claiming savings.
- Prefer changes that also improve reliability: smaller context reads, fewer retries, clearer evidence, and better entrypoints.
- Keep safety, approval, uncertainty, verification, and Bob steering explicit.
- Treat external tools as candidates until a later story approves adoption.
- Use official or primary sources when current tool behavior matters.

## Candidate Matrix

| Candidate | Current fit | Allowed now | Adoption gate |
| --- | --- | --- | --- |
| `ccusage` | High for local usage visibility | Evaluate and document only | Proves useful local Codex/Claude visibility without credential/session exposure |
| Headroom | Medium-high for context/tool-output compression | Spike plan only | Controlled before/after evidence proves meaning, safety, and citations survive compression |
| Caveman-style concise prompting | High as a policy influence | Professional quiet-operator guidance only | Guidance improves clarity without hiding progress or decisions |
| Defluffer-style cleanup | Medium for prompt linting | Lint/recommendation only | Never automatically mutates safety docs, acceptance criteria, authority packets, or evidence |
| Provider prompt caching | Medium for repo-owned LLM calls | Design note only | Repo owns stable prompt prefixes and can verify cache behavior and cost impact |
| Redis LangCache | Low for local interactive agent work | Defer | Repeated app-level LLM calls exist and a cache boundary is approved |

## Baseline Measurement Plan

Before optimization claims, collect comparable examples:

1. Pick 3 to 5 representative workflows:
   - BMAD story implementation.
   - Tool failure diagnosis.
   - Documentation update with verification.
   - Research/tool evaluation.
   - PR delivery or review-comment resolution.
2. Record the rough task shape, duration, major tool calls, and verification outcome.
3. If `ccusage` is evaluated, confirm what local sources it reads and whether Codex support is mature enough for the project.
4. Compare before/after only against similar workflow types.
5. Report savings as directional unless exact token accounting is available.

## Headroom Spike Criteria

A Headroom spike may proceed only in a later story or explicitly approved task.
The spike should use read-only inputs and compare compressed vs uncompressed
behavior on representative local artifacts.

Required evidence:

- Original input class: file, tool output, logs, or search results.
- Compression ratio.
- Whether citations, paths, commands, line numbers, and stop lines survive.
- Whether an agent can answer task-specific questions correctly from compressed input.
- Failure cases where compression hides risk or changes meaning.
- Recommendation: reject, keep experimenting, or propose bounded adoption.

Stop immediately if compression obscures approval gates, destructive actions,
credential/session boundaries, source/evidence boundaries, failed checks, or
uncertainty Bob needs to see.

## Defluffer-Style Cleanup Criteria

Defluffer-style cleanup can be useful as a reviewer, not an editor. It may
suggest shorter wording for prompts or routine notes, but should not automatically
change:

- Acceptance criteria.
- Story tasks.
- Authority packets.
- Safety policies.
- Evidence contracts.
- Stop lines.
- Verification results.

## Provider Prompt Caching Criteria

Use provider prompt caching only for repo-owned LLM calls where Kendall_Nxt owns
prompt layout. Put stable system, tool, policy, and examples first; put task-
specific inputs later. Do not restructure third-party CLI agent prompts unless a
future story owns that integration.

## Deferred Semantic Cache Criteria

Redis LangCache or another semantic cache belongs later, when Kendall_Nxt has
repeated app-level LLM calls with clear cache boundaries, invalidation rules,
data classification, retention policy, and operator visibility.

## Non-Goals

This plan does not install tools, call providers, spend money, read credentials,
launch workers, mutate GitHub, clean up worktrees, or enable autonomous token
optimization. It creates evidence gates for later decisions.
