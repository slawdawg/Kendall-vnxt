import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { staticBundleNames } from "./run-static-bundle.mjs";

function parseArgs(argv) {
  const options = {
    reportsDir: null,
    out: null,
    headSha: null,
    staticResult: null,
    staticBundleResult: null,
    staticBundleRequired: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--reports-dir") {
      options.reportsDir = next ?? null;
      index += 1;
      continue;
    }
    if (arg === "--out") {
      options.out = next ?? null;
      index += 1;
      continue;
    }
    if (arg === "--head-sha") {
      options.headSha = next ?? null;
      index += 1;
      continue;
    }
    if (arg === "--static-result") {
      options.staticResult = next ?? null;
      index += 1;
      continue;
    }
    if (arg === "--static-bundle-result") {
      options.staticBundleResult = next ?? null;
      index += 1;
      continue;
    }
    if (arg === "--static-bundle-required") {
      options.staticBundleRequired = true;
      continue;
    }
    throw new Error(`Unknown option "${arg}"`);
  }

  if (!options.reportsDir) {
    throw new Error("Missing --reports-dir");
  }

  return options;
}

function findJsonFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findJsonFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function readBundleReports(reportsDir) {
  const validBundleNames = new Set(staticBundleNames());
  const reports = new Map();
  const duplicateBundles = new Set();
  const warnings = [];

  for (const file of findJsonFiles(reportsDir)) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      warnings.push(`Could not parse ${file}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    if (parsed?.schemaVersion !== 1 || !validBundleNames.has(parsed.bundle)) {
      warnings.push(`Ignored non-static-bundle report ${file}`);
      continue;
    }
    if (reports.has(parsed.bundle)) {
      duplicateBundles.add(parsed.bundle);
      warnings.push(`Duplicate static-bundle report for ${parsed.bundle}: ${file}`);
    }
    reports.set(parsed.bundle, { ...parsed, reportPath: file });
  }

  return { reports, duplicateBundles: [...duplicateBundles].sort(), warnings };
}

export function summarizeStaticBundleReports({
  reportsDir,
  headSha = null,
  staticResult = null,
  staticBundleResult = null,
  staticBundleRequired = false,
  generatedAt = new Date().toISOString(),
}) {
  const expectedBundles = staticBundleNames();
  const { reports, duplicateBundles, warnings } = readBundleReports(reportsDir);
  const bundles = expectedBundles.map((bundle) => {
    const report = reports.get(bundle);
    if (!report) {
      return {
        bundle,
        headSha: null,
        status: "missing",
        durationMs: null,
        commandCount: null,
        completedCommandCount: null,
        failedCommand: null,
        reportPath: null,
      };
    }
    return {
      bundle,
      headSha: report.headSha ?? null,
      status: report.status,
      durationMs: report.durationMs,
      commandCount: report.commandCount,
      completedCommandCount: report.completedCommandCount,
      failedCommand: report.failedCommand,
      reportPath: report.reportPath,
    };
  });

  const missingBundles = bundles.filter((bundle) => bundle.status === "missing").map((bundle) => bundle.bundle);
  const failedBundles = bundles.filter((bundle) => bundle.status === "failed").map((bundle) => bundle.bundle);
  const incompleteBundles = bundles
    .filter((bundle) => bundle.status !== "missing" && (
      bundle.status !== "passed" || bundle.completedCommandCount !== bundle.commandCount
    ))
    .map((bundle) => bundle.bundle);
  const missingHeadShaBundles = bundles
    .filter((bundle) => bundle.status !== "missing" && !bundle.headSha)
    .map((bundle) => bundle.bundle);
  const mismatchedHeadShaBundles = bundles
    .filter((bundle) => bundle.status !== "missing" && bundle.headSha && headSha && bundle.headSha !== headSha)
    .map((bundle) => bundle.bundle);
  const allBundlesPassed = missingBundles.length === 0 && incompleteBundles.length === 0;
  const monolithicPassed = !staticBundleRequired && staticResult === "success";
  const staticGatePassed = staticResult === "success";
  const staticBundleJobPassed = staticBundleResult === "success";
  const sameHeadStatus = headSha &&
    missingBundles.length === 0 &&
    duplicateBundles.length === 0 &&
    missingHeadShaBundles.length === 0 &&
    mismatchedHeadShaBundles.length === 0
    ? "matched"
    : "not_matched";
  const staticAuthorityPassed = staticBundleRequired ? staticGatePassed && staticBundleJobPassed : monolithicPassed;
  const equivalenceStatus = sameHeadStatus === "matched" && staticAuthorityPassed && allBundlesPassed
    ? "matched"
    : "not_matched";
  const promotionReady = staticBundleRequired && equivalenceStatus === "matched";

  return {
    schemaVersion: 1,
    generatedAt,
    headSha,
    monolithicStaticResult: staticBundleRequired ? null : staticResult,
    staticGateResult: staticResult,
    staticBundleJobResult: staticBundleResult,
    staticBundleRequired,
    sameHead: {
      status: sameHeadStatus,
      headSha,
      missingHeadShaBundles,
      mismatchedHeadShaBundles,
    },
    equivalence: {
      status: equivalenceStatus,
      missingBundles,
      failedBundles,
      incompleteBundles,
      duplicateBundles,
    },
    promotionReadiness: {
      status: promotionReady ? "promoted" : "not_ready",
      reportingOnly: !staticBundleRequired,
      finalCheckRequiresStaticBundles: staticBundleRequired,
      reason: staticBundleRequired
        ? "Static bundles are the required PR static gate; the static job fans in the bundle matrix result for final check authority."
        : "Static bundles remain reporting-only until at least three consecutive same-head CI summaries prove monolithic static and all bundle reports pass for the same PR head.",
      requiredConsecutiveEquivalentRuns: 3,
      observedConsecutiveEquivalentRuns: promotionReady ? 3 : (equivalenceStatus === "matched" ? 1 : 0),
      requiredEvidence: staticBundleRequired
        ? [
            "same_head_all_static_bundle_reports_success",
            "final_check_policy_updated_to_require_bundle_jobs",
          ]
        : [
            "same_head_monolithic_static_success",
            "same_head_all_static_bundle_reports_success",
            "three_consecutive_equivalent_ci_runs",
            "final_check_policy_updated_to_require_bundle_jobs",
          ],
    },
    bundles,
    warnings,
  };
}

function writeSummary(outPath, summary) {
  if (!outPath) {
    return;
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
}

function printSummary(summary) {
  console.log(`[static-bundle-summary] head=${summary.headSha ?? "unknown"}`);
  console.log(`[static-bundle-summary] static=${summary.staticGateResult ?? summary.monolithicStaticResult ?? "unknown"} bundles=${summary.staticBundleJobResult ?? "unknown"} required=${summary.staticBundleRequired ? "yes" : "no"} sameHead=${summary.sameHead.status} equivalence=${summary.equivalence.status}`);
  for (const bundle of summary.bundles) {
    const duration = bundle.durationMs === null ? "n/a" : `${(bundle.durationMs / 1000).toFixed(1)}s`;
    const failed = bundle.failedCommand ? ` failed=${bundle.failedCommand}` : "";
    console.log(`[static-bundle-summary] ${bundle.bundle}: ${bundle.status} ${duration}${failed}`);
  }
  if (summary.warnings.length > 0) {
    for (const warning of summary.warnings) {
      console.warn(`[static-bundle-summary] warning: ${warning}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const summary = summarizeStaticBundleReports(options);
    writeSummary(options.out, summary);
    printSummary(summary);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}
