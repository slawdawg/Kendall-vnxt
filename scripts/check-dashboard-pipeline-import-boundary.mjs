#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const dashboardSrcDir = join(rootDir, "apps/dashboard/src");

const PIPELINE_SOURCE_TARGETS = [
  "apps/dashboard/src/app/pipeline",
  "apps/dashboard/src/components/pipeline",
  "apps/dashboard/src/lib/pipeline-fixtures.ts",
  "apps/dashboard/src/lib/pipeline-packet-loader.ts",
];

const forbiddenImportPatterns = [
  { id: "node-child-process", pattern: /^(node:)?child_process$/ },
  { id: "node-fs", pattern: /^(node:)?fs(\/promises)?$/ },
  { id: "node-worker-threads", pattern: /^(node:)?worker_threads$/ },
  { id: "node-http", pattern: /^(node:)?https?$/ },
  { id: "provider-sdk", pattern: /^(openai|@anthropic-ai\/sdk|@anthropic|ollama|langchain|ai)$/ },
  { id: "http-client", pattern: /^(axios|undici)$/ },
  { id: "supervisor-client", pattern: /(^|\/)supervisor$/ },
  { id: "filesystem-backed-evidence-loader", pattern: /pipeline-evidence-source$/ },
  { id: "workspace-or-worker-script", pattern: /codex-workspace|governed-worker|cockpit-systemd|cleanup/i },
  { id: "obsidian-or-github-client", pattern: /obsidian|github|octokit|gh-/i },
];

const forbiddenCallPatterns = [
  { id: "network-fetch", pattern: /\bfetch\s*\(/ },
  { id: "network-eventsource", pattern: /\bEventSource\s*\(/ },
  { id: "network-websocket", pattern: /\bWebSocket\s*\(/ },
  { id: "network-xhr", pattern: /\bXMLHttpRequest\s*\(/ },
  { id: "network-beacon", pattern: /\bsendBeacon\s*\(/ },
  { id: "process-spawn", pattern: /\b(?:spawn|exec|execFile|fork)\s*\(/ },
  { id: "filesystem-mutation", pattern: /\b(?:writeFile|appendFile|mkdir|rename|unlink|rm|rmdir)\s*\(/ },
  { id: "browser-worker-launch", pattern: /\bnew\s+Worker\s*\(/ },
  { id: "provider-call", pattern: /\b(?:createChatCompletion|chat\.completions\.create|responses\.create|generateContent)\s*\(/ },
  { id: "runner-launch", pattern: /\b(?:runCodex|launchCodex|runClaude|launchClaude|runHermes|launchHermes|startWorker|launchWorker)\s*\(/ },
  { id: "obsidian-mutation", pattern: /\b(?:writeObsidian|mutateObsidian|updateCanonicalMemory|obsidianWriteBack|vaultWrite)\s*\(/ },
  { id: "github-mutation", pattern: /\b(?:createPullRequest|mergePullRequest|pushBranch|deleteBranch|syncIssue|createIssue)\s*\(/ },
  { id: "cleanup-mutation", pattern: /\b(?:cleanupCurrent|cleanupMerged|cleanupOrphans|deleteWorktree|removeWorktree|deleteRemoteBranch)\s*\(/ },
];

const readOnlyPipelineRuntimeFunctions = [
  "getPipelineDashboardProjection",
  "getWorkPacket",
  "getWorkPacketForWorkItem",
  "getWorkItemMemoryReview",
  "getWorkPackets",
];

const readOnlyPipelineRuntimeEndpoints = new Map([
  ["getPipelineDashboardProjection", "/pipeline-control-plane/projection"],
  ["getWorkPacket", "/pipeline-control-plane/work-packets/${encodeURIComponent(packetId)}"],
  ["getWorkPacketForWorkItem", "/pipeline-control-plane/work-items/${encodeURIComponent(workItemId)}/packet"],
  ["getWorkItemMemoryReview", "/pipeline-control-plane/work-items/${encodeURIComponent(workItemId)}/memory-review"],
  ["getWorkPackets", "/pipeline-control-plane/work-packets"],
]);

const disabledNormalPipelineRouteImports = new Set([
  "apps/dashboard/src/components/realtime-refresh.tsx",
]);

const requiredSourceFiles = [
  "apps/dashboard/src/app/pipeline/page.tsx",
  "apps/dashboard/src/app/pipeline/packets/[packetId]/page.tsx",
  "apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx",
  "apps/dashboard/src/components/pipeline/packet-detail-page.tsx",
  "apps/dashboard/src/lib/pipeline-fixtures.ts",
  "apps/dashboard/src/lib/pipeline-supervisor-runtime.ts",
];

const failures = [];
const scannedFiles = [];
const scannedFileSet = new Set();
const pendingFiles = [];
const gatedSupervisorEdgesAudited = new Set();

const normalRouteGraph = await collectRouteGraph([
  join(rootDir, "apps/dashboard/src/app/pipeline/page.tsx"),
  join(rootDir, "apps/dashboard/src/app/pipeline/packets/[packetId]/page.tsx"),
], { skipDisabledImports: disabledNormalPipelineRouteImports });
const demoRouteGraph = await collectRouteGraph([
  join(rootDir, "apps/dashboard/src/app/pipeline/demo/page.tsx"),
  join(rootDir, "apps/dashboard/src/app/pipeline/demo/packets/[packetId]/page.tsx"),
]);
if (normalRouteGraph.includes("apps/dashboard/src/lib/pipeline-fixtures.ts")) {
  failures.push("normal /pipeline route graph must not reach apps/dashboard/src/lib/pipeline-fixtures.ts");
}
if (!demoRouteGraph.includes("apps/dashboard/src/lib/pipeline-fixtures.ts")) {
  failures.push("explicit /pipeline/demo route graph must retain access to apps/dashboard/src/lib/pipeline-fixtures.ts");
}
if (normalRouteGraph.includes("apps/dashboard/src/lib/pipeline/manager-execution-lane-summary.ts")) {
  failures.push("normal /pipeline route graph must not reach apps/dashboard/src/lib/pipeline/manager-execution-lane-summary.ts");
}
if (!demoRouteGraph.includes("apps/dashboard/src/lib/pipeline/manager-execution-lane-summary.ts")) {
  failures.push("explicit /pipeline/demo route graph must retain access to apps/dashboard/src/lib/pipeline/manager-execution-lane-summary.ts");
}
for (const runtimeBoundaryFile of [
  "apps/dashboard/src/lib/pipeline-packet-loader.ts",
  "apps/dashboard/src/lib/pipeline-supervisor-runtime.ts",
  "apps/dashboard/src/lib/pipeline-supervisor-projector.ts",
]) {
  const runtimeBoundarySource = await readFile(join(rootDir, runtimeBoundaryFile), "utf8");
  if (/pipeline-fixtures/.test(runtimeBoundarySource)) {
    failures.push(`${runtimeBoundaryFile}: runtime boundary must not import or reference the fixture catalog`);
  }
  if (/fixture fallback|fixture_fallback/i.test(runtimeBoundarySource)) {
    failures.push(`${runtimeBoundaryFile}: stale fixture-fallback semantics remain in the runtime boundary`);
  }
}

for (const target of PIPELINE_SOURCE_TARGETS) {
  for (const filePath of await expandTarget(join(rootDir, target))) {
    queueFile(filePath);
  }
}

while (pendingFiles.length > 0) {
  const filePath = pendingFiles.shift();
  const source = await readFile(filePath, "utf8");
  const displayPath = relative(rootDir, filePath);
  scannedFiles.push(displayPath);
  const specifiers = checkImports(displayPath, source);
  checkForbiddenCalls(displayPath, source);
  for (const specifier of specifiers) {
    if (isGatedSupervisorImport(displayPath, specifier)) {
      continue;
    }
    const resolvedImport = await resolveLocalImport(filePath, specifier);
    if (resolvedImport) {
      queueFile(resolvedImport);
    }
  }
}

for (const sourceFile of requiredSourceFiles) {
  if (!scannedFiles.includes(sourceFile)) {
    failures.push(`${sourceFile}: required pipeline boundary source was not scanned`);
  }
}
const actionSupervisorEdge = "apps/dashboard/src/lib/pipeline-supervisor-actions.ts -> ./supervisor";
if (!gatedSupervisorEdgesAudited.has(actionSupervisorEdge)) {
  failures.push(`${actionSupervisorEdge}: capability-gated supervisor edge was not audited`);
}

if (failures.length > 0) {
  console.error("Dashboard pipeline import boundary check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      scannedFiles: scannedFiles.length,
      normalRouteGraphFiles: normalRouteGraph.length,
      demoRouteGraphFiles: demoRouteGraph.length,
      normalFixtureCatalogReachable: false,
      demoFixtureCatalogReachable: true,
      normalManagerFixtureSummaryReachable: false,
      demoManagerFixtureSummaryReachable: true,
      normalSupervisorModuleReachable: normalRouteGraph.includes("apps/dashboard/src/lib/supervisor.ts"),
      gatedSupervisorEdgesAudited: [...gatedSupervisorEdgesAudited],
      boundary:
        "No direct provider, shell, filesystem, GitHub, Obsidian, runner launch, cleanup, or live network calls from the /pipeline read graph outside the dedicated read-only supervisor runtime module.",
    },
    null,
    2
  )
);

async function expandTarget(targetPath) {
  const targetStat = await stat(targetPath);
  if (targetStat.isFile()) {
    return [targetPath];
  }

  const entries = await readdir(targetPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = join(targetPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await expandTarget(entryPath));
      continue;
    }
    if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

async function collectRouteGraph(entryFiles, { skipDisabledImports = new Set() } = {}) {
  const files = [];
  const visited = new Set();
  const pending = [...entryFiles];
  while (pending.length > 0) {
    const filePath = normalize(pending.shift());
    if (visited.has(filePath)) {
      continue;
    }
    visited.add(filePath);
    const source = await readFile(filePath, "utf8");
    const displayPath = relative(rootDir, filePath).replaceAll("\\", "/");
    files.push(displayPath);
    checkImports(displayPath, source);
    checkForbiddenCalls(displayPath, source);
    for (const specifier of extractRuntimeImportSpecifiers(source)) {
      if (isGatedSupervisorImport(displayPath, specifier)) {
        continue;
      }
      const resolvedImport = await resolveLocalImport(filePath, specifier, { allDashboardLocal: true });
      const resolvedDisplayPath = resolvedImport
        ? relative(rootDir, resolvedImport).replaceAll("\\", "/")
        : null;
      if (resolvedImport && !skipDisabledImports.has(resolvedDisplayPath) && !visited.has(resolvedImport)) {
        pending.push(resolvedImport);
      }
    }
  }
  return files;
}

function queueFile(filePath) {
  const normalizedPath = normalize(filePath);
  if (scannedFileSet.has(normalizedPath)) {
    return;
  }
  scannedFileSet.add(normalizedPath);
  pendingFiles.push(normalizedPath);
}

function checkImports(displayPath, source) {
  checkUnresolvedDynamicModuleBoundaries(displayPath, source);
  const typeOnlyImportPatterns = [
    /^\s*import\s+type[\s\S]*?\sfrom\s+["']([^"']+)["'];?/gm,
    /^\s*export\s+type[\s\S]*?\sfrom\s+["']([^"']+)["'];?/gm,
  ];
  for (const typeOnlyImportPattern of typeOnlyImportPatterns) {
    for (const importMatch of source.matchAll(typeOnlyImportPattern)) {
      for (const { id, pattern } of forbiddenImportPatterns) {
        if (id === "supervisor-client" && isAllowedPipelineSupervisorImport(displayPath, importMatch[1])) {
          continue;
        }
        if (pattern.test(importMatch[1])) {
          failures.push(`${displayPath}: forbidden type-only import boundary ${id}: ${importMatch[1]}`);
        }
      }
    }
  }
  const specifiers = extractRuntimeImportSpecifiers(source);
  for (const specifier of specifiers) {
    if (isGatedSupervisorImport(displayPath, specifier)) {
      gatedSupervisorEdgesAudited.add(`${displayPath} -> ${specifier}`);
    }
  }
  for (const specifier of specifiers) {
    for (const { id, pattern } of forbiddenImportPatterns) {
      if (id === "supervisor-client" && isAllowedPipelineSupervisorImport(displayPath, specifier)) {
        continue;
      }
      if (pattern.test(specifier)) {
        failures.push(`${displayPath}: forbidden import boundary ${id}: ${specifier}`);
      }
    }
  }

  return specifiers;
}

function checkUnresolvedDynamicModuleBoundaries(displayPath, source) {
  const executableSource = stripCommentsAndStringsForModuleDetection(source);
  const unresolvedDynamicImportPattern = /\b(?:import|require)\s*\((?!\s*["'][^"']*["']\s*\))\s*[^)]*\)/g;
  for (const match of executableSource.matchAll(unresolvedDynamicImportPattern)) {
    failures.push(`${displayPath}: unresolved dynamic module boundary: ${match[0]}`);
  }
}

function extractRuntimeImportSpecifiers(source) {
  const runtimeSource = source
    .replace(/^\s*import\s+type[\s\S]*?\sfrom\s+["'][^"']+["'];?/gm, "")
    .replace(/^\s*export\s+type[\s\S]*?\sfrom\s+["'][^"']+["'];?/gm, "");
  const importPatterns = [
    /^\s*import[\s\S]*?\sfrom\s+["']([^"']+)["'];?/gm,
    /^\s*import\s+["']([^"']+)["'];?/gm,
    /^\s*export[\s\S]*?\sfrom\s+["']([^"']+)["'];?/gm,
    /\b(?:import|require)\s*\(\s*(?:(?:(?:\/\*[\s\S]*?\*\/)|(?:\/\/[^\n]*(?:\n|$)))\s*)*["']([^"']+)["']\s*\)/g,
  ];

  const quotedSpecifiers = importPatterns.flatMap((importPattern) =>
    [...runtimeSource.matchAll(importPattern)].map((importMatch) => importMatch[1])
  );
  const staticTemplateSpecifiers = [...runtimeSource.matchAll(/\b(?:import|require)\s*\(\s*(?:(?:(?:\/\*[\s\S]*?\*\/)|(?:\/\/[^\n]*(?:\n|$)))\s*)*`([^`]*)`\s*\)/g)]
    .map((match) => match[1])
    .filter((specifier) => !specifier.includes("${"));

  return [...quotedSpecifiers, ...staticTemplateSpecifiers];
}

function checkForbiddenCalls(displayPath, source) {
  const executableSource = stripCommentsAndStrings(source);
  const allowedCallIds = new Set(
    displayPath === "apps/dashboard/src/components/realtime-refresh.tsx"
      ? ["network-eventsource"]
      : displayPath === "apps/dashboard/src/lib/pipeline-supervisor-runtime.ts"
        ? ["network-fetch"]
      : displayPath === "apps/dashboard/src/lib/dashboard-supervisor-transport.ts"
          ? ["network-fetch"]
        : displayPath === "apps/dashboard/src/lib/dashboard-session-role.ts"
          ? ["network-fetch"]
      : displayPath === "apps/dashboard/src/components/logout-button.tsx"
          ? ["network-fetch"]
        : displayPath === "apps/dashboard/src/components/pipeline/lan-packet-detail-page.tsx"
          ? ["network-fetch"]
        : [],
  );
  if (displayPath === "apps/dashboard/src/lib/pipeline-supervisor-runtime.ts") {
    checkReadOnlyPipelineRuntimeFunctions(displayPath, source);
  }
  if (displayPath === "apps/dashboard/src/lib/dashboard-supervisor-transport.ts") {
    checkDashboardSupervisorTransport(displayPath, source);
  }
  if (displayPath === "apps/dashboard/src/lib/dashboard-session-role.ts") {
    checkDashboardSessionRole(displayPath, source);
  }
  if (displayPath === "apps/dashboard/src/components/logout-button.tsx") {
    const logoutFetch = /fetch\(\s*["']\/auth\/logout["']\s*,([\s\S]*?)\n?\s*\}\);/.exec(source)?.[1] || "";
    if (
      countMatches(executableSource, /\bfetch\s*\(/g) !== 1
      || !logoutFetch
      || !/method:\s*["']POST["']/.test(logoutFetch)
      || !/credentials:\s*["']same-origin["']/.test(logoutFetch)
      || !/["']x-csrf-token["']\s*:/.test(logoutFetch)
    ) {
      failures.push(`${displayPath}: auth logout fetch must be a single same-origin POST with CSRF header`);
    }
  }
  if (displayPath === "apps/dashboard/src/components/pipeline/lan-packet-detail-page.tsx") {
    const mediatorFetch = /fetch\(\s*`\/api\/packet-detail\/\$\{encodeURIComponent\(packetId\)\}`([\s\S]*?)\);/.exec(source)?.[1] || "";
    if (
      countMatches(executableSource, /\bfetch\s*\(/g) !== 1
      || !mediatorFetch
      || !/credentials:\s*["']same-origin["']/.test(mediatorFetch)
      || !/cache:\s*["']no-store["']/.test(mediatorFetch)
    ) {
      failures.push(`${displayPath}: Packet Detail fetch must be a single same-origin no-store mediator read`);
    }
  }
  for (const { id, pattern } of forbiddenCallPatterns) {
    if (id === "network-fetch" && displayPath === "apps/dashboard/src/lib/pipeline-supervisor-runtime.ts") {
      continue;
    }
    if (!allowedCallIds.has(id) && pattern.test(executableSource)) {
      failures.push(`${displayPath}: forbidden call boundary ${id}`);
    }
  }
}

function checkDashboardSupervisorTransport(displayPath, source) {
  const readSource = extractFunctionSource(source, "requestSupervisorJson") || "";
  const mutationSource = extractFunctionSource(source, "requestSupervisorMutation") || "";
  if (
    countMatches(stripCommentsAndStrings(source), /\bfetch\s*\(/g) !== 2 ||
    countMatches(stripCommentsAndStrings(readSource), /\bfetch\s*\(/g) !== 1 ||
    !/cache:\s*["']no-store["']/.test(readSource) ||
    /\bmethod\s*:/.test(stripComments(readSource)) ||
    countMatches(stripCommentsAndStrings(mutationSource), /\bfetch\s*\(/g) !== 1 ||
    !/credentials:\s*["']same-origin["']/.test(mutationSource) ||
    !/cache:\s*["']no-store["']/.test(mutationSource) ||
    !/headers\.set\(["']origin["']/.test(mutationSource) ||
    !/headers\.set\(["']x-csrf-token["']/.test(mutationSource)
  ) {
    failures.push(`${displayPath}: shared transport must contain one read-only no-store fetch and one same-origin CSRF mutation fetch`);
  }
}

function checkDashboardSessionRole(displayPath, source) {
  const executableSource = stripCommentsAndStrings(source);
  if (
    countMatches(executableSource, /\bfetch\s*\(/g) !== 1 ||
    !/fetch\(\s*["']\/auth\/session["']/.test(source) ||
    !/credentials:\s*["']same-origin["']/.test(source) ||
    !/cache:\s*["']no-store["']/.test(source) ||
    !/AbortController/.test(source)
  ) {
    failures.push(`${displayPath}: session-role read must be one abortable same-origin no-store /auth/session fetch`);
  }
}

function checkReadOnlyPipelineRuntimeFunctions(displayPath, source) {
  const exportedFunctions = extractRuntimeExportNames(source);
  const unexpectedExports = exportedFunctions.filter((exportName) => !readOnlyPipelineRuntimeFunctions.includes(exportName));
  if (
    exportedFunctions.length !== readOnlyPipelineRuntimeFunctions.length ||
    unexpectedExports.length > 0 ||
    readOnlyPipelineRuntimeFunctions.some((functionName) => !exportedFunctions.includes(functionName))
  ) {
    failures.push(
      `${displayPath}: only the approved read-only runtime functions may be exported` +
      (unexpectedExports.length > 0 ? ` (unapproved: ${unexpectedExports.join(", ")})` : ""),
    );
  }
  const requestJsonSource = extractFunctionSource(source, "requestJson");
  if (!requestJsonSource) {
    failures.push(`${displayPath}: missing audited read-only helper requestJson`);
    return;
  }
  const requestJsonSourceWithoutComments = stripComments(requestJsonSource);
  const usesSharedTransport = /\brequestSupervisorJson(?:<[^;\n]*>)?\s*\(/.test(requestJsonSourceWithoutComments);
  if (!usesSharedTransport) {
    const executableRequestJsonSource = stripCommentsAndStrings(requestJsonSource);
    const allowedSignalSpread = /\.\.\.\s*\(\s*controller\s*\?\s*\{\s*signal\s*:\s*controller\.signal\s*\}\s*:\s*\{\s*\}\s*\)/g;
    const requestJsonSourceWithoutAllowedSpread = requestJsonSourceWithoutComments.replace(allowedSignalSpread, "");
    const requestJsonHasHiddenMethod = /\bmethod\s*:|\[[^\]]+\]\s*:/.test(requestJsonSourceWithoutComments);
    const requestJsonHasUnsafeSpread = /\.\.\./.test(requestJsonSourceWithoutAllowedSpread);
    if (
      countMatches(stripCommentsAndStrings(source), /\bfetch\s*\(/g) !== 1 ||
      countMatches(executableRequestJsonSource, /\bfetch\s*\(/g) !== 1 ||
      requestJsonHasHiddenMethod ||
      requestJsonHasUnsafeSpread ||
      !/\bfetch\s*\([\s\S]*\{\s*cache\s*:\s*["']no-store["']/.test(requestJsonSourceWithoutComments)
    ) {
      failures.push(`${displayPath}: forbidden call boundary network-fetch`);
    }
  }
  if (
    (usesSharedTransport && countMatches(stripCommentsAndStrings(source), /\bfetch\s*\(/g) !== 0) ||
    (usesSharedTransport && countMatches(stripCommentsAndStrings(requestJsonSource), /\brequestSupervisorJson(?:<[^;\n]*>)?\s*\(/g) !== 1) ||
    (usesSharedTransport && !/timeoutMs:\s*(?:10_000|options\.timeoutMs\s*\?\?\s*10_000)/.test(requestJsonSourceWithoutComments)) ||
    (usesSharedTransport && !/rejectServerLanAuth:\s*true/.test(requestJsonSourceWithoutComments))
  ) {
    if (usesSharedTransport) failures.push(`${displayPath}: pipeline runtime must delegate reads to the shared authenticated transport`);
  }

  for (const functionName of readOnlyPipelineRuntimeFunctions) {
    const functionSource = extractFunctionSource(source, functionName);
    if (!functionSource) {
      failures.push(`${displayPath}: missing audited read-only export ${functionName}`);
      continue;
    }
    const executableFunctionSource = stripCommentsAndStrings(functionSource);
    if (
      countMatches(executableFunctionSource, /\bfetch\s*\(/g) > 0 ||
      countMatches(executableFunctionSource, /\brequestJson(?:<[^;\n]*>)?\s*\(/g) !== 1
    ) {
      failures.push(`${displayPath}: forbidden call boundary network-fetch`);
    }
    const expectedEndpoint = readOnlyPipelineRuntimeEndpoints.get(functionName);
    if (expectedEndpoint && !functionSource.includes(expectedEndpoint)) {
      failures.push(`${displayPath}: approved endpoint mismatch for ${functionName}`);
    }
  }
}

function extractRuntimeExportNames(source) {
  const exportNames = [];
  for (const match of source.matchAll(/\bexport\s+(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)\b/g)) {
    exportNames.push(match[1]);
  }
  for (const match of source.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const specifier of match[1].split(",")) {
      const tokens = specifier.trim().split(/\s+as\s+/);
      const exportName = tokens.at(-1)?.trim();
      if (exportName) {
        exportNames.push(exportName);
      }
    }
  }
  if (/\bexport\s+default\b/.test(source)) {
    exportNames.push("default");
  }
  return exportNames;
}

function extractFunctionSource(source, functionName) {
  const declaration = new RegExp(`(?:async\\s+)?function\\s+${functionName}\\b`).exec(source);
  if (!declaration) {
    return null;
  }
  let bodyStart = -1;
  let parameterDepth = 0;
  let sawParameters = false;
  let quote = null;
  let escaped = false;
  for (let index = declaration.index + declaration[0].length; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") {
      parameterDepth += 1;
      sawParameters = true;
      continue;
    }
    if (char === ")") {
      parameterDepth -= 1;
      continue;
    }
    if (char === "{" && sawParameters && parameterDepth === 0) {
      bodyStart = index;
      break;
    }
  }
  if (bodyStart < 0) {
    return null;
  }
  let depth = 0;
  quote = null;
  escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(declaration.index, index + 1);
      }
    }
  }
  return null;
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function stripCommentsAndStringsForModuleDetection(source) {
  return source
    .replace(/`(?:\\.|[^`\\])*`/g, (templateSource) => {
      const expressions = extractTemplateExpressions(templateSource);
      return expressions.length > 0 ? expressions : "\"\"";
    })
    .replace(/"(?:\\.|[^"\\])*"/g, "\"\"")
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function stripCommentsAndStrings(source) {
  return source
    .replace(/`(?:\\.|[^`\\])*`/g, (templateSource) => extractTemplateExpressions(templateSource))
    .replace(/"(?:\\.|[^"\\])*"/g, "\"\"")
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function extractTemplateExpressions(templateSource) {
  const expressions = [];
  for (let index = 0; index < templateSource.length; index += 1) {
    if (templateSource[index] !== "$" || templateSource[index + 1] !== "{") {
      continue;
    }
    let depth = 1;
    let cursor = index + 2;
    const expressionStart = cursor;
    while (cursor < templateSource.length && depth > 0) {
      const char = templateSource[cursor];
      if (char === "\\") {
        cursor += 2;
        continue;
      }
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
      }
      cursor += 1;
    }
    if (depth === 0) {
      expressions.push(templateSource.slice(expressionStart, cursor - 1));
      index = cursor - 1;
    }
  }
  return expressions.join("\n");
}

async function resolveLocalImport(fromFile, specifier, { allDashboardLocal = false } = {}) {
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
    if (!specifier.startsWith("@/")) {
      return null;
    }
  }

  const basePath = specifier.startsWith("@/")
    ? join(dashboardSrcDir, specifier.slice(2))
    : specifier.startsWith("/")
      ? join(dashboardSrcDir, specifier.slice(1))
      : resolve(dirname(fromFile), specifier);
  if (!isInsideDashboardSrc(basePath) || (!allDashboardLocal && !isPipelineBoundaryPath(basePath))) {
    return null;
  }

  for (const candidate of importCandidates(basePath)) {
    try {
      const candidateStat = await stat(candidate);
      if (candidateStat.isFile()) {
        return candidate;
      }
    } catch {
      // Try the next candidate shape.
    }
  }
  return null;
}

function importCandidates(basePath) {
  if (extname(basePath)) {
    return [basePath];
  }
  return [
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    join(basePath, "index.ts"),
    join(basePath, "index.tsx"),
    join(basePath, "index.js"),
    join(basePath, "index.jsx"),
  ];
}

function isInsideDashboardSrc(filePath) {
  const relativePath = relative(dashboardSrcDir, filePath);
  return relativePath !== "" && !relativePath.startsWith("..") && !relativePath.startsWith("/");
}

function isPipelineBoundaryPath(filePath) {
  const relativePath = relative(rootDir, filePath).replaceAll("\\", "/");
  return (
    relativePath.startsWith("apps/dashboard/src/app/pipeline/") ||
    relativePath.startsWith("apps/dashboard/src/components/pipeline/") ||
    relativePath.startsWith("apps/dashboard/src/lib/pipeline/") ||
    relativePath.startsWith("apps/dashboard/src/lib/pipeline-")
  );
}

function isAllowedPipelineSupervisorImport(displayPath, specifier) {
  return (
    (displayPath === "apps/dashboard/src/components/realtime-refresh.tsx" && specifier === "../lib/supervisor") ||
    isGatedSupervisorImport(displayPath, specifier)
  );
}

function isGatedSupervisorImport(displayPath, specifier) {
  return (
    displayPath === "apps/dashboard/src/lib/pipeline-supervisor-actions.ts" &&
    specifier === "./supervisor"
  ) || (
    displayPath === "apps/dashboard/src/components/realtime-refresh.tsx" &&
    specifier === "../lib/supervisor"
  );
}
