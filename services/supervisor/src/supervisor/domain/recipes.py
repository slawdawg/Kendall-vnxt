from dataclasses import dataclass


@dataclass(frozen=True)
class PolicyGate:
    id: str
    label: str
    required_before: str
    summary: str
    evidence: tuple[str, ...]


@dataclass(frozen=True)
class RecipeCommand:
    display: str
    args: tuple[str, ...]


@dataclass(frozen=True)
class RemoteAutomationPolicy:
    status: str
    summary: str
    allowed_operations: tuple[str, ...]
    blocked_operations: tuple[str, ...]
    approval_requirements: tuple[str, ...]


@dataclass(frozen=True)
class ExecutionRecipe:
    id: str
    label: str
    summary: str
    branch_prefix: str
    allowed_paths: tuple[str, ...]
    implementation_commands: tuple[RecipeCommand, ...]
    verification_commands: tuple[RecipeCommand, ...]
    policy_gates: tuple[PolicyGate, ...]
    operator_checkpoints: tuple[str, ...]
    autonomy_notes: tuple[str, ...]
    remote_automation_policy: RemoteAutomationPolicy


REMOTE_AUTOMATION_BLOCKED = RemoteAutomationPolicy(
    status="blocked",
    summary="Remote delivery automation is blocked until a concrete remote workflow and KNX boundary decision approve it.",
    allowed_operations=("record delivery readiness evidence", "record explicit local-only waiver", "render local delivery package"),
    blocked_operations=("git push", "pull request creation", "CI wait", "merge", "release", "deployment"),
    approval_requirements=(
        "remote workflow proposed",
        "Git remote recorded",
        "KNX data boundary accepts the remote destination",
        "allowed remote operations are named",
        "rollback/exit path is recorded",
    ),
)


DASHBOARD_TEST_COVERAGE_RECIPE = ExecutionRecipe(
    id="dashboard-test-coverage",
    label="Dashboard test coverage",
    summary="Add or adjust focused dashboard coverage, then verify the browser suite and shared repo checks before review.",
    branch_prefix="e2e-",
    allowed_paths=("tests/e2e", "playwright.config.ts", "apps/dashboard", "services/supervisor"),
    implementation_commands=(
        RecipeCommand(display="node scripts/dashboard-test-coverage-recipe.mjs", args=("node", "scripts/dashboard-test-coverage-recipe.mjs")),
        RecipeCommand(display="pnpm run lint:dashboard", args=("pnpm", "run", "lint:dashboard")),
    ),
    verification_commands=(
        RecipeCommand(display="pnpm run test:e2e:dashboard", args=("pnpm", "run", "test:e2e:dashboard")),
        RecipeCommand(display="pnpm run check", args=("pnpm", "run", "check")),
    ),
    policy_gates=(
        PolicyGate(
            id="scope",
            label="Scope gate",
            required_before="ready",
            summary="The work item must come from the operator dashboard lane and stay low or medium risk.",
            evidence=("source starts with operator-dashboard", "riskLevel is low or medium"),
        ),
        PolicyGate(
            id="clean-worktree",
            label="Clean worktree gate",
            required_before="implementation",
            summary="Supervisor may only start the recipe when the local repository has no pending changes.",
            evidence=("git status --porcelain returns empty output",),
        ),
        PolicyGate(
            id="branch-ownership",
            label="Branch ownership gate",
            required_before="implementation",
            summary="Supervisor may only prepare or implement on the recorded recipe branch when its base revision is still current.",
            evidence=(
                "executionBranch starts with the recipe branch prefix",
                "baseRevision matches current base branch",
                "branch preparation creates or switches to executionBranch",
                "current branch equals executionBranch before implementation",
            ),
        ),
        PolicyGate(
            id="implementation-automation",
            label="Implementation automation gate",
            required_before="implementation",
            summary="Supervisor may only run implementation automation declared by the selected recipe inside the repo root.",
            evidence=("implementationCommands are recipe-owned", "work item context is passed through environment", "exit codes are recorded before implementation starts"),
        ),
        PolicyGate(
            id="path-scope",
            label="Path scope gate",
            required_before="verification",
            summary="Supervisor may only hand recipe work to validation when changed files stay inside the recipe boundary.",
            evidence=("changed files are under allowedPaths", "git diff from baseRevision is inspected"),
        ),
        PolicyGate(
            id="verification",
            label="Verification gate",
            required_before="review",
            summary="Operator must record validation evidence before the work can move into review.",
            evidence=("pnpm run test:e2e:dashboard", "pnpm run check"),
        ),
        PolicyGate(
            id="delivery-readiness",
            label="Delivery readiness gate",
            required_before="done",
            summary="Supervisor must produce a local delivery package before final review; remote delivery remains operator-gated.",
            evidence=("local changed-path package recorded", "diff summary recorded", "remote operations marked record-only"),
        ),
        PolicyGate(
            id="review",
            label="Operator review gate",
            required_before="done",
            summary="Operator approval is required before the supervisor can mark recipe work complete.",
            evidence=("operator approval note",),
        ),
    ),
    operator_checkpoints=(
        "Review the generated scope before implementation begins.",
        "Prepare or confirm the recorded execution branch before implementation begins.",
        "Review supervisor-run implementation command evidence before validation.",
        "Confirm validation evidence before approving review.",
        "Confirm PR, CI, and merge readiness before final approval.",
        "Approve or request rework from the review lane.",
    ),
    autonomy_notes=(
        "Keep the change scoped to dashboard workflows and adjacent supervisor test fixtures.",
        "Mutating implementation automation may only write recipe-owned dashboard coverage artifacts.",
        "Do not continue if the branch is stale, the repo is dirty, or verification fails.",
        "Open a PR only after the browser suite and repo checks both pass.",
    ),
    remote_automation_policy=REMOTE_AUTOMATION_BLOCKED,
)

DASHBOARD_MOBILE_COVERAGE_RECIPE = ExecutionRecipe(
    id="dashboard-mobile-coverage",
    label="Dashboard mobile coverage",
    summary="Add or adjust focused mobile dashboard coverage, then verify the browser suite and shared repo checks before review.",
    branch_prefix="mobile-e2e-",
    allowed_paths=("tests/e2e", "playwright.config.ts", "apps/dashboard", "services/supervisor"),
    implementation_commands=(
        RecipeCommand(display="node scripts/dashboard-mobile-coverage-recipe.mjs", args=("node", "scripts/dashboard-mobile-coverage-recipe.mjs")),
        RecipeCommand(display="pnpm run lint:dashboard", args=("pnpm", "run", "lint:dashboard")),
    ),
    verification_commands=(
        RecipeCommand(display="pnpm run test:e2e:dashboard", args=("pnpm", "run", "test:e2e:dashboard")),
        RecipeCommand(display="pnpm run check", args=("pnpm", "run", "check")),
    ),
    policy_gates=DASHBOARD_TEST_COVERAGE_RECIPE.policy_gates,
    operator_checkpoints=DASHBOARD_TEST_COVERAGE_RECIPE.operator_checkpoints,
    autonomy_notes=(
        "Keep the change scoped to mobile dashboard workflows and adjacent supervisor test fixtures.",
        "Mutating implementation automation may only write recipe-owned mobile dashboard coverage artifacts.",
        "Do not continue if the branch is stale, the repo is dirty, or verification fails.",
        "Open a PR only after the browser suite and repo checks both pass.",
    ),
    remote_automation_policy=REMOTE_AUTOMATION_BLOCKED,
)


EXECUTION_RECIPES = {
    DASHBOARD_TEST_COVERAGE_RECIPE.id: DASHBOARD_TEST_COVERAGE_RECIPE,
    DASHBOARD_MOBILE_COVERAGE_RECIPE.id: DASHBOARD_MOBILE_COVERAGE_RECIPE,
}
