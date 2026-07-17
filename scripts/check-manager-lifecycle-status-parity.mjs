#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const paths = {
  lifecycle: join(root, "packages/contracts/src/manager-control-plane/lifecycle.ts"),
  workflow: join(root, "packages/workflow-core/src/manager-control-plane/work-item-lifecycle.ts"),
  summary: join(root, "scripts/lib/manager-control-plane/summary-projection.mjs"),
  pythonDomain: join(root, "services/supervisor/src/supervisor/domain/types.py"),
  pythonApi: join(root, "services/supervisor/src/supervisor/api/schemas.py"),
  pipeline: join(root, "packages/contracts/src/pipeline-control-plane/index.ts"),
};

export async function checkManagerLifecycleStatusParity() {
  const sources = Object.fromEntries(await Promise.all(
    Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ));
  const managerStatuses = extractTsArray(sources.lifecycle, "WORK_ITEM_STATUSES");
  const summaryStatuses = extractJsArray(sources.summary, "WORK_STATUSES");
  const workflowStatuses = extractQuotedBlock(sources.workflow, "const allowedTransitions");
  const pythonManagerStatuses = extractPythonEnum(sources.pythonDomain, "ManagerWorkItemStatus");
  const authoritativeStatuses = extractTsArray(sources.pipeline, "AUTHORITATIVE_PACKET_STATUSES");
  const pythonAuthoritativeStatuses = extractLiteral(sources.pythonApi, "AuthoritativePacketStatus");

  assert.deepEqual(summaryStatuses, managerStatuses, "summary projection statuses must match contracts");
  assert.deepEqual(pythonManagerStatuses, managerStatuses, "Python manager statuses must match contracts");
  assert.deepEqual([...new Set(workflowStatuses)].sort(), [...managerStatuses].sort(), "workflow transition map must cover each manager status exactly");
  assert.deepEqual(pythonAuthoritativeStatuses, authoritativeStatuses, "Python API packet statuses must match pipeline contract");

  return {
    status: "PASS",
    managerWorkItemStatuses: managerStatuses,
    authoritativePacketStatuses: authoritativeStatuses,
    parity: {
      summaryProjection: true,
      workflowTransitions: true,
      pythonDomain: true,
      pythonApi: true,
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await checkManagerLifecycleStatusParity(), null, 2));
}

function extractTsArray(source, name) {
  const match = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`));
  assert.ok(match, `missing TypeScript array ${name}`);
  return [...match[1].matchAll(/"([^\"]+)"/g)].map((entry) => entry[1]);
}

function extractJsArray(source, name) {
  const match = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\];`));
  assert.ok(match, `missing JavaScript array ${name}`);
  return [...match[1].matchAll(/"([^\"]+)"/g)].map((entry) => entry[1]);
}

function extractQuotedBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing block ${marker}`);
  const end = source.indexOf("]);", start);
  assert.ok(end > start, `unterminated block ${marker}`);
  return [...source.slice(start, end).matchAll(/"([^\"]+)"/g)].map((entry) => entry[1]);
}

function extractPythonEnum(source, name) {
  const match = source.match(new RegExp(`class ${name}\\(StrEnum\\):([\\s\\S]*?)(?=\\n\\nclass |$)`));
  assert.ok(match, `missing Python enum ${name}`);
  return [...match[1].matchAll(/^\s+[A-Z][A-Z0-9_]* = "([^"]+)"/gm)].map((entry) => entry[1]);
}

function extractLiteral(source, name) {
  const match = source.match(new RegExp(`${name} = Literal\\[([\\s\\S]*?)\\]`));
  assert.ok(match, `missing Python Literal ${name}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}
