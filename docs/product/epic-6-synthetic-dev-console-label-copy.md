# Update Dev Console Label Copy

Status: Review
RiskLevel: low

## Story

As Bob,
I want the Dev Console labels to use plain language,
so that I can understand work status without developer terminology.

## Acceptance Criteria

1. Proposed Work labels use plain language.
2. Active Work labels avoid internal orchestration jargon.
3. Detail panels keep technical evidence available behind clear headings.
4. No worker launch, provider call, command execution, Git operation, or GitHub operation is required.

## Authority

Allowed:

- metadata-only BMAD import,
- Candidate Work approval and promotion,
- routing preview,
- fake or blocked execution attempt evidence.

Blocked:

- real Codex launch,
- real Claude launch,
- provider calls,
- shell command execution outside tests,
- source mutation by workers,
- Git or GitHub operations.

## Verification

- Import this artifact as Candidate Work.
- Promote it into Active Work after approval.
- Generate a routing preview and fake or blocked execution attempt.
- Confirm Dev Console evidence links the attempt to the source artifact and Task Packet.
