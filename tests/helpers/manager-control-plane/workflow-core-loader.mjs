import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const helperDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = dirname(dirname(dirname(helperDir)));
const workflowCoreModuleCache = new Map();

function resolveTscCommand(repoRoot) {
  for (const candidate of [
    join("apps", "dashboard", "node_modules", ".bin", "tsc"),
    join("node_modules", ".bin", "tsc")
  ]) {
    const resolved = join(repoRoot, candidate);
    if (existsSync(resolved)) {
      return [resolved, []];
    }
  }
  return ["pnpm", ["--dir", join(repoRoot, "apps/dashboard"), "exec", "tsc"]];
}

export async function loadWorkflowCoreManagerControlPlane({ repoRoot = defaultRepoRoot } = {}) {
  const cacheKey = repoRoot;
  if (!workflowCoreModuleCache.has(cacheKey)) {
    workflowCoreModuleCache.set(cacheKey, compileAndLoadWorkflowCoreManagerControlPlane(repoRoot));
  }
  return workflowCoreModuleCache.get(cacheKey);
}

async function compileAndLoadWorkflowCoreManagerControlPlane(repoRoot) {
  const outDir = await mkdtemp(join(tmpdir(), "manager-dispatcher-"));
  await writeFile(join(outDir, "package.json"), '{"type":"module"}\n');

  const [tscCommand, tscPrefixArgs] = resolveTscCommand(repoRoot);
  const result = spawnSync(
    tscCommand,
    [
      ...tscPrefixArgs,
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--strict",
      "--verbatimModuleSyntax",
      "--rootDir",
      repoRoot,
      "--outDir",
      outDir,
      join(repoRoot, "packages/contracts/src/index.ts"),
      join(repoRoot, "packages/workflow-core/src/index.ts")
    ],
    { cwd: repoRoot, encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);

  await rewriteCompiledImports(outDir);
  await writeContractShim(outDir);

  return import(pathToFileURL(join(outDir, "packages/workflow-core/src/index.js")).href);
}

async function rewriteCompiledImports(outDir) {
  const targets = await listCompiledJavaScriptFiles(outDir);
  for (const target of targets) {
    let source = await readFile(target, "utf8");
    source = source.replaceAll(/(from\s+["'])(\.[^"']+)(["'])/g, (_match, prefix, specifier, suffix) => {
      return `${prefix}${resolveCompiledSpecifier(target, specifier)}${suffix}`;
    });
    source = source.replaceAll(/(import\s+["'])(\.[^"']+)(["'])/g, (_match, prefix, specifier, suffix) => {
      return `${prefix}${resolveCompiledSpecifier(target, specifier)}${suffix}`;
    });
    await writeFile(target, source);
  }
}

async function listCompiledJavaScriptFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listCompiledJavaScriptFiles(path));
    } else if (entry.isFile() && path.endsWith(".js")) {
      files.push(path);
    }
  }
  return files;
}

function resolveCompiledSpecifier(filePath, specifier) {
  if (!specifier.startsWith(".") || specifier.endsWith(".js") || specifier.endsWith(".json")) {
    return specifier;
  }
  const basePath = join(dirname(filePath), specifier);
  if (existsSync(`${basePath}.js`)) {
    return `${specifier}.js`;
  }
  if (existsSync(join(basePath, "index.js"))) {
    return `${specifier}/index.js`;
  }
  return specifier;
}

async function writeContractShim(outDir) {
  const contractPackageRoot = join(outDir, "node_modules", "@kendall", "contracts");
  await mkdir(contractPackageRoot, { recursive: true });
  await writeFile(
    join(contractPackageRoot, "package.json"),
    JSON.stringify({
      type: "module",
      exports: {
        ".": "./index.js"
      }
    })
  );
  await writeFile(
    join(contractPackageRoot, "index.js"),
    [
      'export * from "../../../packages/contracts/src/index.js";',
      ""
    ].join("\n")
  );
}
