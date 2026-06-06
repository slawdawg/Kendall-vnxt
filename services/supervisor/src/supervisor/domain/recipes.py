from dataclasses import dataclass


@dataclass(frozen=True)
class ExecutionRecipe:
    id: str
    label: str
    summary: str
    branch_prefix: str
    allowed_paths: tuple[str, ...]
    verification_commands: tuple[str, ...]
    autonomy_notes: tuple[str, ...]


DASHBOARD_TEST_COVERAGE_RECIPE = ExecutionRecipe(
    id="dashboard-test-coverage",
    label="Dashboard test coverage",
    summary="Add or adjust focused dashboard coverage, then verify the browser suite and shared repo checks before review.",
    branch_prefix="e2e-",
    allowed_paths=("tests/e2e", "playwright.config.ts", "apps/dashboard", "services/supervisor"),
    verification_commands=("pnpm run test:e2e:dashboard", "pnpm run check"),
    autonomy_notes=(
        "Keep the change scoped to dashboard workflows and adjacent supervisor test fixtures.",
        "Do not continue if the branch is stale, the repo is dirty, or verification fails.",
        "Open a PR only after the browser suite and repo checks both pass.",
    ),
)


EXECUTION_RECIPES = {
    DASHBOARD_TEST_COVERAGE_RECIPE.id: DASHBOARD_TEST_COVERAGE_RECIPE,
}
