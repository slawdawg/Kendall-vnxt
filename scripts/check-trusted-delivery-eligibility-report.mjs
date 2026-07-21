import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(rootDir, path), "utf8");
const schemaSource = read("services/supervisor/src/supervisor/api/schemas.py");
const contractSource = read("packages/contracts/src/api.ts");
const apiSource = read("services/supervisor/src/supervisor/api/main.py");
const serviceSource = read("services/supervisor/src/supervisor/application/service.py");
const catalogSource = read("scripts/check-supervisor-report-catalog.mjs");
const packageJson = JSON.parse(read("package.json"));

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const reportStart = schemaSource.indexOf("class TrustedDeliveryEligibilityReportView");
const reportEnd = schemaSource.indexOf("\n\nclass TrustedDeliveryEligibilityReportApiEnvelope", reportStart);
const reportSchema = reportStart >= 0 && reportEnd > reportStart ? schemaSource.slice(reportStart, reportEnd) : "";
const envelopeStart = schemaSource.indexOf("class TrustedDeliveryEligibilityReportApiEnvelope");
const envelopeEnd = schemaSource.indexOf("\n\nclass LowRiskDeliveryPlanActionView", envelopeStart);
const envelopeSchema = envelopeStart >= 0 && envelopeEnd > envelopeStart ? schemaSource.slice(envelopeStart, envelopeEnd) : "";
const contractStart = contractSource.indexOf("export interface TrustedDeliveryEligibilityReportView");
const contractEnd = contractSource.indexOf("\nexport interface TrustedDeliveryEligibilityReportApiEnvelope", contractStart);
const contract = contractStart >= 0 && contractEnd > contractStart ? contractSource.slice(contractStart, contractEnd) : "";
const routeStart = apiSource.indexOf('@app.get("/supervisor/trusted-delivery-eligibility-report", response_model=TrustedDeliveryEligibilityReportApiEnvelope)');
const routeEnd = apiSource.indexOf("\n\n@app.", routeStart);
const route = routeStart >= 0 && routeEnd > routeStart ? apiSource.slice(routeStart, routeEnd) : "";
const getterStart = serviceSource.indexOf("    async def get_trusted_delivery_eligibility_report(");
const getterEnd = serviceSource.indexOf("    async def get_low_risk_delivery_plan_report(", getterStart);
const getter = getterStart >= 0 && getterEnd > getterStart ? serviceSource.slice(getterStart, getterEnd) : "";

assert(packageJson.scripts?.["check:trusted-delivery-eligibility"] === "node ./scripts/check-trusted-delivery-eligibility-report.mjs", "package.json must wire check:trusted-delivery-eligibility");
assert(packageJson.scripts?.["check:reports"] === "node ./scripts/check-supervisor-report-catalog.mjs", "check:reports must retain the supervisor report catalog checker");
assert(catalogSource.includes('import "./check-trusted-delivery-eligibility-report.mjs";'), "supervisor report catalog must import the trusted eligibility checker in-process");
assert(packageJson.scripts?.check?.includes("check:reports"), "root check must include check:reports");
assert(packageJson.scripts?.["check:static"]?.includes("check:reports"), "check:static must include check:reports");
for (const className of [
  "TrustedDeliveryEligibilityCheckView",
  "TrustedDeliveryEligibilityStageEvaluationView",
  "TrustedDeliveryDiffGuardFileView",
  "TrustedDeliveryDiffGuardView",
  "TrustedDeliveryDiffGuardFixtureView",
  "TrustedDeliveryVerificationEvidenceView",
  "TrustedDeliveryVerificationEvidenceFixtureView",
  "TrustedDeliveryActionEligibilityView",
  "TrustedDeliveryActionEligibilityFixtureView",
  "TrustedDeliveryEligibilityReportView",
]) {
  assert(schemaSource.includes(`class ${className}(BaseModel):\n    model_config = ConfigDict(extra="forbid", strict=True)`), `${className} must be strict`);
}
assert(envelopeSchema.includes('model_config = ConfigDict(extra="forbid", strict=True)') && envelopeSchema.includes("data: TrustedDeliveryEligibilityReportView") && envelopeSchema.includes("meta: dict[str, str | int | float | bool | None] | None = None"), "Trusted delivery eligibility envelope must be strict and typed");
for (const field of ["readOnly: Literal[True]", "automaticDeliveryApproved: Literal[False]", "pushPrAutoEligible: bool", "mergeAutoEligible: bool", "cleanupAutoEligible: bool"]) assert(reportSchema.includes(`    ${field}`), `Report must include ${field}`);
for (const field of ["readOnly: true;", "automaticDeliveryApproved: false;", "pushPrAutoEligible: boolean;", "mergeAutoEligible: boolean;", "cleanupAutoEligible: boolean;"]) assert(contract.includes(`  ${field}`), `Contract must include ${field}`);
for (const field of ["reportId: str", "generatedAt: datetime", "summary: str", "currentBranch: str", "baseBranch: str", "headRevision: str", "workingTreeStatus: str", "commitsAhead: int", "diffStat: str", "diffGuard: TrustedDeliveryDiffGuardView", "diffGuardFixtures: list[TrustedDeliveryDiffGuardFixtureView]", "verificationEvidenceFixtures: list[TrustedDeliveryVerificationEvidenceFixtureView]", "actionEligibility: list[TrustedDeliveryActionEligibilityView]", "actionEligibilityFixtures: list[TrustedDeliveryActionEligibilityFixtureView]", "unrelatedAuthoritiesBlocked: list[str]", "stages: list[TrustedDeliveryEligibilityStageEvaluationView]", "hardStops: list[str]", "nextSafeActions: list[str]"]) assert(reportSchema.includes(`    ${field}`), `Report must include ${field}`);
for (const field of ["reportId: string;", "generatedAt: string;", "summary: string;", "currentBranch: string;", "baseBranch: string;", "headRevision: string;", "workingTreeStatus: string;", "commitsAhead: number;", "diffStat: string;", "diffGuard: TrustedDeliveryDiffGuardView;", "diffGuardFixtures: TrustedDeliveryDiffGuardFixtureView[];", "verificationEvidenceFixtures: TrustedDeliveryVerificationEvidenceFixtureView[];", "actionEligibility: TrustedDeliveryActionEligibilityView[];", "actionEligibilityFixtures: TrustedDeliveryActionEligibilityFixtureView[];", "unrelatedAuthoritiesBlocked: string[];", "stages: TrustedDeliveryEligibilityStageEvaluationView[];", "hardStops: string[];", "nextSafeActions: string[];"]) assert(contract.includes(`  ${field}`), `Contract must include ${field}`);
assert(route.includes("return TrustedDeliveryEligibilityReportApiEnvelope(data=await service.get_trusted_delivery_eligibility_report())"), "Supervisor route must return typed trusted eligibility envelope");
assert(!route.includes("push(") && !route.includes("merge(") && !route.includes("cleanup(") && !route.includes("subprocess") && !route.includes("httpx"), "Supervisor trusted eligibility route must remain read-only and non-provider");
assert(getter.includes("_git_output") && !/\b(?:subprocess|httpx|gh\s+(?:pr|api)|git\s+(?:push|merge|clean|reset|checkout))\b/i.test(getter), "Trusted eligibility getter must remain read-only and provider-free");
const gitOutputCalls = [...getter.matchAll(/self\._git_output\(\[[^\n]+\]\)/g)].map(([call]) => call);
assert(gitOutputCalls.length === 7 && gitOutputCalls.every((call) => [
  'self._git_output(["git", "branch", "--show-current"])',
  'self._git_output(["git", "rev-parse", "--short", "HEAD"])',
  'self._git_output(["git", "status", "--porcelain=v1"])',
  'self._git_output(["git", "rev-parse", "--verify", base_branch])',
  'self._git_output(["git", "rev-list", "--count", f"{base_branch}..HEAD"])',
  'self._git_output(["git", "diff", "--stat", f"{base_branch}...HEAD"])',
  'self._git_output(["git", "diff", "--name-status", f"{base_branch}...HEAD"])',
].includes(call)), "Trusted eligibility getter must use only the seven literal read-only git commands");
assert((schemaSource.match(/class TrustedDeliveryEligibilityReportView\b/g) ?? []).length === 1 && (schemaSource.match(/class TrustedDeliveryEligibilityReportApiEnvelope\b/g) ?? []).length === 1 && (contractSource.match(/export interface TrustedDeliveryEligibilityReportView\b/g) ?? []).length === 1 && (contractSource.match(/export interface TrustedDeliveryEligibilityReportApiEnvelope\b/g) ?? []).length === 1 && (apiSource.match(/@app\.get\("\/supervisor\/trusted-delivery-eligibility-report"/g) ?? []).length === 1, "Trusted eligibility declarations must be unique");
if (failures.length) { console.error(`Trusted delivery eligibility report drift check failed:\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("OK: trusted delivery eligibility report drift checks passed.");
