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

const requiredSourceFiles = [
  "apps/dashboard/src/app/pipeline/page.tsx",
  "apps/dashboard/src/app/pipeline/packets/[packetId]/page.tsx",
  "apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx",
  "apps/dashboard/src/components/pipeline/packet-detail-page.tsx",
  "apps/dashboard/src/lib/pipeline-fixtures.ts",
];

const routeGraphTerminalFiles = [
  join(rootDir, "apps/dashboard/src/components/shell.tsx"),
  join(rootDir, "apps/dashboard/src/lib/supervisor.ts"),
];

const failures = [];
const scannedFiles = [];
const scannedFileSet = new Set();
const pendingFiles = [];

const normalRouteGraph = await collectRouteGraph([
  join(rootDir, "apps/dashboard/src/app/pipeline/page.tsx"),
  join(rootDir, "apps/dashboard/src/app/pipeline/packets/[packetId]/page.tsx"),
], { terminalFiles: routeGraphTerminalFiles });
const demoRouteGraph = await collectRouteGraph([
  join(rootDir, "apps/dashboard/src/app/pipeline/demo/page.tsx"),
  join(rootDir, "apps/dashboard/src/app/pipeline/demo/packets/[packetId]/page.tsx"),
], { terminalFiles: routeGraphTerminalFiles });
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
      boundary:
        "No direct provider, shell, filesystem, GitHub, Obsidian, runner launch, cleanup, or live network calls from /pipeline dashboard code outside the read-only supervisor WorkPacketV0 projection loader.",
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

async function collectRouteGraph(entryFiles, { terminalFiles = [] } = {}) {
  const files = [];
  const visited = new Set();
  const pending = [...entryFiles];
  const terminalPathSet = new Set(terminalFiles.map((filePath) => normalize(filePath)));
  while (pending.length > 0) {
    const filePath = normalize(pending.shift());
    if (visited.has(filePath)) {
      continue;
    }
    visited.add(filePath);
    const source = await readFile(filePath, "utf8");
    const displayPath = relative(rootDir, filePath).replaceAll("\\", "/");
    files.push(displayPath);
    if (!terminalPathSet.has(filePath)) {
      checkImports(displayPath, source);
      checkForbiddenCalls(displayPath, source);
    }
    if (terminalPathSet.has(filePath)) {
      continue;
    }
    for (const specifier of extractRuntimeImportSpecifiers(source)) {
      const resolvedImport = await resolveLocalImport(filePath, specifier, { allDashboardLocal: true });
      if (resolvedImport && !visited.has(resolvedImport)) {
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
  const typeOnlyImportPatterns = [
    /^\s*import\s+type[\s\S]*?\sfrom\s+["']([^"']+)["'];?/gm,
    /^\s*export\s+type[\s\S]*?\sfrom\s+["']([^"']+)["'];?/gm,
  ];
  for (const typeOnlyImportPattern of typeOnlyImportPatterns) {
    for (const importMatch of source.matchAll(typeOnlyImportPattern)) {
      for (const { id, pattern } of forbiddenImportPatterns) {
        if (id === "supervisor-client" && isAllowedReadOnlySupervisorProjection(displayPath, importMatch[1])) {
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
    for (const { id, pattern } of forbiddenImportPatterns) {
      if (id === "supervisor-client" && isAllowedReadOnlySupervisorProjection(displayPath, specifier)) {
        continue;
      }
      if (pattern.test(specifier)) {
        failures.push(`${displayPath}: forbidden import boundary ${id}: ${specifier}`);
      }
    }
  }

  return specifiers;
}

function extractRuntimeImportSpecifiers(source) {
  const runtimeSource = source
    .replace(/^\s*import\s+type[\s\S]*?\sfrom\s+["'][^"']+["'];?/gm, "")
    .replace(/^\s*export\s+type[\s\S]*?\sfrom\s+["'][^"']+["'];?/gm, "");
  const importPatterns = [
    /^\s*import[\s\S]*?\sfrom\s+["']([^"']+)["'];?/gm,
    /^\s*import\s+["']([^"']+)["'];?/gm,
    /^\s*export[\s\S]*?\sfrom\s+["']([^"']+)["'];?/gm,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  return importPatterns.flatMap((importPattern) =>
    [...runtimeSource.matchAll(importPattern)].map((importMatch) => importMatch[1])
  );
}

function checkForbiddenCalls(displayPath, source) {
  const executableSource = stripCommentsAndStrings(source);
  for (const { id, pattern } of forbiddenCallPatterns) {
    if (pattern.test(executableSource)) {
      failures.push(`${displayPath}: forbidden call boundary ${id}`);
    }
  }
}

function stripCommentsAndStrings(source) {
  return source
    .replace(/`(?:\\.|[^`\\])*`/g, (templateSource) => extractTemplateExpressions(templateSource))
    .replace(/"(?:\\.|[^"\\])*"/g, "\"\"")
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
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

function isAllowedReadOnlySupervisorProjection(displayPath, specifier) {
  return displayPath === "apps/dashboard/src/lib/pipeline-packet-loader.ts" && specifier === "./supervisor";
}
