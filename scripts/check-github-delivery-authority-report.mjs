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

const reportStart = schemaSource.indexOf("class GitHubDeliveryAuthorityReportView");
const reportEnd = schemaSource.indexOf("\n\nclass GitHubDeliveryAuthorityReportApiEnvelope", reportStart);
const reportSchema = reportStart >= 0 && reportEnd > reportStart ? schemaSource.slice(reportStart, reportEnd) : "";
const envelopeStart = schemaSource.indexOf("class GitHubDeliveryAuthorityReportApiEnvelope");
const envelopeEnd = schemaSource.indexOf("\n\nclass TrustedDeliveryEligibilityCheckView", envelopeStart);
const envelopeSchema = envelopeStart >= 0 && envelopeEnd > envelopeStart ? schemaSource.slice(envelopeStart, envelopeEnd) : "";
const contractStart = contractSource.indexOf("export interface GitHubDeliveryAuthorityReportView");
const contractEnd = contractSource.indexOf("\nexport interface GitHubDeliveryAuthorityReportApiEnvelope", contractStart);
const contract = contractStart >= 0 && contractEnd > contractStart ? contractSource.slice(contractStart, contractEnd) : "";
const routeStart = apiSource.indexOf('@app.get("/supervisor/github-delivery-authority-report", response_model=GitHubDeliveryAuthorityReportApiEnvelope)');
const routeEnd = apiSource.indexOf("\n\n@app.", routeStart);
const route = routeStart >= 0 && routeEnd > routeStart ? apiSource.slice(routeStart, routeEnd) : "";
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

assert(packageJson.scripts?.["check:github-delivery-authority"] === "node ./scripts/check-github-delivery-authority-report.mjs", "package.json must wire check:github-delivery-authority");
assert(packageJson.scripts?.["check:reports"] === "node ./scripts/check-supervisor-report-catalog.mjs", "check:reports must retain the supervisor report catalog checker");
assert(catalogSource.includes("check-github-delivery-authority-report.mjs"), "supervisor report catalog must invoke the GitHub authority checker");
assert(packageJson.scripts?.check?.includes("check:reports"), "root check must include check:reports");
assert(packageJson.scripts?.["check:static"]?.includes("check:reports"), "check:static must include check:reports");
assert(schemaSource.includes("class GitHubDeliveryAuthorityStepView(BaseModel):\n    model_config = ConfigDict(extra=\"forbid\", strict=True)"), "Authority steps must be strict");
assert(schemaSource.includes("class GitHubDeliveryEligibilityStageView(BaseModel):\n    model_config = ConfigDict(extra=\"forbid\", strict=True)"), "Eligibility stages must be strict");
assert(reportSchema.includes('model_config = ConfigDict(extra="forbid", strict=True)'), "GitHub authority report must be strict");
assert(envelopeSchema.includes('model_config = ConfigDict(extra="forbid", strict=True)') && envelopeSchema.includes("data: GitHubDeliveryAuthorityReportView") && envelopeSchema.includes("meta: dict[str, str | int | float | bool | None] | None = None"), "GitHub authority envelope must be strict and typed");
for (const field of ["readOnly: Literal[True]", "pushApproved: Literal[False]", "pullRequestApproved: Literal[False]", "ciWaitApproved: Literal[False]", "reviewResolutionApproved: Literal[False]", "mergeApproved: Literal[False]", "remoteCleanupApproved: Literal[False]", "automaticDeliveryApproved: Literal[False]"]) assert(reportSchema.includes(field), `Report must include ${field}`);
for (const field of ["readOnly: true;", "pushApproved: false;", "pullRequestApproved: false;", "ciWaitApproved: false;", "reviewResolutionApproved: false;", "mergeApproved: false;", "remoteCleanupApproved: false;", "automaticDeliveryApproved: false;"]) assert(contract.includes(field), `Contract must include ${field}`);
for (const field of ["reportId: str", "generatedAt: datetime", "summary: str", "authorityFamily: str", "approvalPrompt: str", "ladder: list[GitHubDeliveryAuthorityStepView]", "trustedDeliveryPolicy: list[str]", "eligibilityStages: list[GitHubDeliveryEligibilityStageView]", "requiredEvidence: list[str]", "rollbackPlan: list[str]", "stopConditions: list[str]", "nextSafeActions: list[str]"]) assert(reportSchema.includes(`    ${field}`), `Report must include ${field}`);
for (const field of ["reportId: string;", "generatedAt: string;", "summary: string;", "authorityFamily: string;", "approvalPrompt: string;", "ladder: GitHubDeliveryAuthorityStepView[];", "trustedDeliveryPolicy: string[];", "eligibilityStages: GitHubDeliveryEligibilityStageView[];", "requiredEvidence: string[];", "rollbackPlan: string[];", "stopConditions: string[];", "nextSafeActions: string[];"]) assert(contract.includes(`  ${field}`), `Contract must include ${field}`);
assert(route.includes("return GitHubDeliveryAuthorityReportApiEnvelope(data=service.get_github_delivery_authority_report())"), "Route must return typed GitHub authority envelope");
assert((schemaSource.match(/class GitHubDeliveryAuthorityStepView\b/g) ?? []).length === 1 && (schemaSource.match(/class GitHubDeliveryEligibilityStageView\b/g) ?? []).length === 1 && (schemaSource.match(/class GitHubDeliveryAuthorityReportView\b/g) ?? []).length === 1 && (schemaSource.match(/class GitHubDeliveryAuthorityReportApiEnvelope\b/g) ?? []).length === 1 && (contractSource.match(/export interface GitHubDeliveryAuthorityReportView\b/g) ?? []).length === 1 && (contractSource.match(/export interface GitHubDeliveryAuthorityReportApiEnvelope\b/g) ?? []).length === 1 && (apiSource.match(/@app\.get\("\/supervisor\/github-delivery-authority-report"/g) ?? []).length === 1, "GitHub authority declarations must be unique");
const getterStart = serviceSource.indexOf("    def get_github_delivery_authority_report(");
const getterEnd = serviceSource.indexOf("    async def get_trusted_delivery_eligibility_report(", getterStart);
const getter = getterStart >= 0 && getterEnd > getterStart ? serviceSource.slice(getterStart, getterEnd) : "";
assert(!getter.includes("subprocess") && !getter.includes("httpx") && !getter.includes("session"), "GitHub authority getter must remain static and non-provider");
if (failures.length) { console.error(`GitHub delivery authority report drift check failed:\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("OK: GitHub delivery authority report drift checks passed.");
