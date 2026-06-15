# Token Economy Measurement Readiness

Date: 2026-06-14
Status: active guidance

## Purpose

Define the minimum evidence needed before Kendall_Nxt claims token savings or
adopts token-economy tooling. This keeps improvement work practical: measure
representative workflow shapes, preserve safety signals, and avoid turning
external tools into hidden authority.

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

## Workflow Samples

Collect at least one baseline packet for each workflow family before making
savings claims:

- BMAD story implementation.
- Tool Churn RCA diagnosis.
- Documentation update with verification.
- Research or external tool evaluation.
- PR delivery or review-comment resolution.

## Measurement Sources

Allowed now:

- Manual workflow notes captured in story Dev Agent Records.
- Local command evidence from repo verification scripts.
- GitHub PR and CI timestamps.
- Tool-call counts summarized from the session by the agent.
- External usage tools only as read-only evaluation candidates after their data
  source and credential/session boundaries are understood.

Not allowed without a later story and explicit approval:

- Provider calls.
- Paid usage.
- Credential, session, token, or account inspection.
- Worker or process launch.
- Raw prompt, completion, reasoning trace, provider payload, or secret retention.
- Compression/cache/proxy adoption.
- GitHub mutation beyond normal PR delivery when Bob requests it.

## Comparison Rules

- Compare only similar workflow families.
- Treat savings as directional unless exact token accounting is available.
- Count reliability wins alongside raw token reductions: fewer retries, smaller
  first reads, clearer stop lines, and faster failed-check diagnosis.
- Do not count hidden context loss as savings.
- If safety, approval, uncertainty, verification, or Bob steering gets harder
  to see, the optimization fails even if token use drops.

## Adoption Gates

Before adopting an external token-economy tool, a later story must show:

- The tool's local data sources.
- Whether it reads credentials, sessions, prompts, completions, reasoning
  traces, provider payloads, or account data.
- Before/after evidence on at least two workflow families.
- Failure cases where the tool hides meaning, citations, paths, line numbers,
  stop lines, or authority boundaries.
- A rollback path and disabled-by-default expectation.

## Non-Goals

This readiness plan does not install tools, call providers, spend money, launch
workers, mutate GitHub, clean worktrees, read credentials, retain raw prompts,
completions, reasoning traces, provider payloads, or secrets, or enable
autonomous token optimization.
