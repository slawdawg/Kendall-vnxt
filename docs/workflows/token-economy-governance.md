# Token Economy Governance

## Purpose

Define how Kendall_Nxt evaluates token-reduction practices before claiming
savings or adopting tooling. The goal is smaller, safer work: fewer retries,
clearer first reads, better entrypoints, and preserved safety signals.

## Evaluation Principles

- Measure before claiming savings.
- Prefer changes that also improve reliability: smaller context reads, fewer
  retries, clearer evidence, and better entrypoints.
- Keep safety, approval, uncertainty, verification, and operator steering explicit.
- Treat external tools as candidates until a later story approves adoption.
- Use official or primary sources when current tool behavior matters.

## Candidate Policy

| Candidate | Current fit | Allowed now | Adoption gate |
| --- | --- | --- | --- |
| `ccusage` | Local usage visibility candidate with experimental Codex support | Fixture-first read-only evaluation only | Proves useful local Codex/Claude visibility from sanitized logs without credential/session exposure |
| Headroom | Context/tool-output compression candidate | Spike plan only | Controlled before/after evidence proves meaning, safety, and citations survive compression |
| Concise prompting | Policy influence | Professional quiet-operator guidance only | Guidance improves clarity without hiding progress or decisions |
| Defluffer-style cleanup | Prompt/review linting candidate | Lint/recommendation only | Never automatically mutates safety docs, acceptance criteria, authority packets, or evidence |
| Provider prompt caching | Repo-owned LLM-call design candidate | Design note only | Repo owns stable prompt prefixes and can verify cache behavior and cost impact |
| Redis LangCache or another semantic cache | Preview app-level response cache candidate | Defer | Repeated app-level LLM calls exist and a cache boundary is approved |

## Baseline Measurement Plan

Before optimization claims, collect comparable examples:

1. Pick 3 to 5 representative workflows:
   - BMAD story implementation.
   - Tool Churn RCA diagnosis.
   - Documentation update with verification.
   - Research or external tool evaluation.
   - PR delivery or review-comment resolution.
2. Record the rough task shape, duration, major tool calls, and verification
   outcome.
3. If `ccusage` is evaluated, start with copied and sanitized Codex JSONL
   fixtures before reading a live `CODEX_HOME`, confirm what local sources it
   reads, and treat Codex support as experimental until current logs prove stable
   enough for the project.
4. Compare before/after only against similar workflow types.
5. Report savings as directional unless exact token accounting is available.

## Baseline Packet

Use this packet for each representative workflow sample:

```text
Token Economy Baseline Packet
- Workflow type:
- Task boundary:
- Context loaded:
- Major tool calls:
- Repeated command/tool failures:
- Verification outcome:
- Safety or authority signals preserved:
- Rough duration:
- Token or usage source:
- Measurement confidence:
- Follow-up recommendation:
```

## Measurement Sources

Allowed now:

- Manual workflow notes captured in story Dev Agent Records.
- Local command evidence from repo verification scripts.
- GitHub PR and CI timestamps.
- Tool-call counts summarized from the session by the agent.
- External usage tools only as read-only evaluation candidates after their data
  source and credential/session boundaries are understood.

For `ccusage` Codex evaluation, use fixture-first evidence:

- Prefer copied and sanitized Codex JSONL or sanitized saved
  `codex exec --json` output.
- Do not point tools at an unrestricted live `CODEX_HOME` until a source review
  is recorded in the lane evidence or local tool-trial packet. The review must
  confirm the paths read, fields parsed, excluded prompt/completion/session
  fields, credential boundaries, and whether the command runs offline.
- Retain only aggregate measurement fields such as date, anonymized session
  label, model, input tokens, cached input tokens, output tokens, reasoning
  tokens, cost estimate, confidence, and known gaps.
- Treat cost and model attribution as estimates when pricing, speed tier, model
  aliases, or missing metadata require fallback behavior. Record the pricing
  source, snapshot date, currency, speed-tier assumption, and fallback reason.

Not allowed without a later story and explicit approval:

- Provider calls.
- Paid usage.
- Credential, session, token, or account inspection.
- Worker or process launch.
- Raw prompt, completion, reasoning trace, provider payload, or secret retention.
- Compression/cache/proxy adoption.
- GitHub mutation beyond normal PR delivery when the operator requests it.

## Comparison Rules

- Compare only similar workflow families.
- Treat savings as directional unless exact token accounting is available.
- Count reliability wins alongside raw token reductions: fewer retries, smaller
  first reads, clearer stop lines, and faster failed-check diagnosis.
- Do not count hidden context loss as savings.
- If safety, approval, uncertainty, verification, or operator steering gets harder
  to see, the optimization fails even if token use drops.

## Headroom Spike Criteria

A Headroom spike may proceed only in a later story or explicitly approved task.
The spike should use read-only inputs and compare compressed vs uncompressed
behavior on representative local artifacts.

Required evidence:

- Original input class: file, tool output, logs, or search results.
- Compression ratio.
- Whether citations, paths, commands, line numbers, and stop lines survive.
- Whether an agent can answer task-specific questions correctly from compressed
  input.
- Failure cases where compression hides risk or changes meaning.
- Recommendation: reject, keep experimenting, or propose bounded adoption.

Stop immediately if compression obscures approval gates, destructive actions,
credential/session boundaries, source/evidence boundaries, failed checks, or
uncertainty the operator needs to see.

## Defluffer-Style Cleanup Criteria

Defluffer-style cleanup can be useful as a reviewer, not an editor. It may
suggest shorter wording for prompts or routine notes, but should not
automatically change:

- Acceptance criteria.
- Story tasks.
- Authority packets.
- Safety policies.
- Evidence contracts.
- Stop lines.
- Verification results.

## Provider Prompt Caching Criteria

Use provider prompt caching only for repo-owned LLM calls where Kendall_Nxt owns
prompt layout. Put stable system, tool, policy, and examples first; put
task-specific inputs later. Do not restructure third-party CLI agent prompts
unless a future story owns that integration.

Provider prompt-cache evidence must include the provider, model,
cache-retention mode and TTL or duration, cache-read/write token fields when
available, privacy or retention constraints, and a before/after comparison
against a similar workflow. If cache-read/write fields or retention duration are
not exposed, record the provider documentation or billing evidence used as a
fallback and mark measurement confidence low. Unknown retention duration blocks
adoption. Automatic provider caching is still a measurement input, not
permission to add new provider calls, paid usage, or prompt retention.

## Deferred Semantic Cache Criteria

Redis LangCache or another semantic cache belongs later, when Kendall_Nxt has
repeated app-level LLM calls with clear cache boundaries, invalidation rules,
data classification, retention policy, operator visibility, and evidence that a
similar-response cache will not replay stale or unsafe answers. Required
semantic-cache evidence must cover stale-answer invalidation, unsafe-answer
rejection, user or tenant boundary isolation, cache-hit inspection, cache-miss
fallback, and rollback or disablement.

## Adoption Gates

Before adopting an external token-economy tool, a later story must show:

- The tool's local data sources.
- Whether it reads credentials, sessions, prompts, completions, reasoning
  traces, provider payloads, or account data.
- Before/after evidence on at least two workflow families.
- Failure cases where the tool hides meaning, citations, paths, line numbers,
  stop lines, or authority boundaries.
- A rollback path and disabled-by-default expectation.
- Raw prompt, completion, reasoning trace, provider payload, or secret retention
  is prohibited unless a future authority explicitly approves a narrower
  retention policy.

## Non-Goals

This workflow does not install tools, call providers, spend money, read
credentials, launch workers, mutate GitHub outside requested PR delivery, clean
worktrees, retain raw prompts, completions, reasoning traces, provider payloads,
or secrets, or enable autonomous token optimization.
