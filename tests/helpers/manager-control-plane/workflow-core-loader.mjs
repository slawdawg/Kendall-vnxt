import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

function resolveTscCommands(outDir) {
  const commonArgs = [
    "--target",
    "ES2022",
    "--module",
    "ESNext",
    "--moduleResolution",
    "Bundler",
    "--strict",
    "--verbatimModuleSyntax"
  ];
  const rootFiles = ["packages/contracts/src/index.ts", "packages/workflow-core/src/index.ts"];
  const dashboardRelativeFiles = ["../../packages/contracts/src/index.ts", "../../packages/workflow-core/src/index.ts"];
  const commands = [];
  for (const candidate of [
    join("apps", "dashboard", "node_modules", ".bin", "tsc"),
    join("node_modules", ".bin", "tsc")
  ]) {
    if (existsSync(candidate)) {
      commands.push([candidate, [...commonArgs, "--rootDir", ".", "--outDir", outDir, ...rootFiles]]);
    }
  }
  commands.push(["pnpm", ["--dir", ".", "exec", "tsc", ...commonArgs, "--rootDir", ".", "--outDir", outDir, ...rootFiles]]);
  commands.push(["pnpm", ["--dir", "apps/dashboard", "exec", "tsc", ...commonArgs, "--rootDir", "../..", "--outDir", outDir, ...dashboardRelativeFiles]]);
  return commands;
}

export async function loadWorkflowCoreManagerControlPlane() {
  assert.equal(existsSync("packages/workflow-core/src/index.ts"), true, "workflow-core loader must run from the repository root");
  assert.equal(existsSync("packages/contracts/src/index.ts"), true, "workflow-core loader must compile the repository contracts package");
  const outDir = await mkdtemp(join(tmpdir(), "manager-dispatcher-"));
  await writeFile(join(outDir, "package.json"), '{"type":"module"}\n');

  const attempts = resolveTscCommands(outDir);
  let result = null;
  for (const [command, args] of attempts) {
    result = spawnSync(command, args, { encoding: "utf8" });
    if (result.status === 0) break;
  }
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
