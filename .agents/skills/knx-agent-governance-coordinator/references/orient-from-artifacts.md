# Orient From Artifacts

## What Success Looks Like

The user can see the current governance phase, which artifacts are already usable, which decisions are still provisional, and the next safe step. The answer should be short enough to act on immediately, but specific enough that another session can continue from the same evidence.

## Use This When

- The user asks "what is next?"
- The user resumes a prior KendallAI vNext planning session.
- The user asks whether the project is ready for another BMad workflow or module build step.

## Inputs To Consider

- SPEC and companion files under `{project-root}/_bmad-output/specs/spec-kendallai-vnext/`.
- Module plan at `{project-root}/_bmad-output/reports/kendallai-vnext-module-plan.md`.
- Shared `knx` memory under `{project-root}/_bmad/memory/knx/`.
- Current handoff at `{project-root}/_bmad-output/handoffs/bmad-session-handoff.md`.
- Existing built skills under `{project-root}/_bmad-output/bmb-creations/skills/knx-*`.

## Output Shape

Provide:

- Current phase.
- Completed or missing artifacts.
- Best next workflow or BMad skill.
- Reasoning in one or two bullets.
- Any blocker that changes the recommendation.

Do not expand into a full project plan unless the user asks for one.
