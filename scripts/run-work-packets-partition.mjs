import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const testFile = "tests/integration/test_work_packets.py";
export const WORK_PACKET_COLLECTION_TIMEOUT_MS = 30_000;

export function partitionWorkPacketNodeIds(nodeIds, index, count) {
  if (!Number.isInteger(index) || !Number.isInteger(count) || count < 2 || index < 0 || index >= count) {
    throw new Error("work-packets partition requires a zero-based index within a count of at least two");
  }
  if (!nodeIds.length || nodeIds.some((nodeId) => !nodeId.startsWith(`${testFile}::`))) {
    throw new Error("work-packets partition requires collected node IDs from the fixed work-packets test file");
  }
  const selected = nodeIds.filter((_, position) => position % count === index);
  if (!selected.length) {
    throw new Error("work-packets partition selected no tests");
  }
  return selected;
}

function parseArgs(args) {
  const parsed = { index: undefined, count: undefined };
  for (let position = 0; position < args.length; position += 1) {
    const value = args[position];
    if (value === "--index") parsed.index = Number(args[++position]);
    else if (value === "--count") parsed.count = Number(args[++position]);
    else throw new Error(`unsupported work-packets partition argument: ${value}`);
  }
  return parsed;
}

function collectWorkPacketNodeIds() {
  const collection = spawnSync("uv", ["run", "--directory", "services/supervisor", "pytest", "-p", "no:cacheprovider", "--collect-only", "-q", testFile], {
    cwd: rootDir,
    encoding: "utf8",
    timeout: WORK_PACKET_COLLECTION_TIMEOUT_MS,
  });
  if (collection.status !== 0) {
    throw new Error(`work-packets collection failed: ${collection.stderr || collection.stdout}`);
  }
  return collection.stdout.split(/\r?\n/).filter((line) => line.startsWith(`${testFile}::`));
}

export function waitForWorkPacketPartition(child) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      resolve(code);
    };
    child.once("error", () => finish(1));
    child.once("exit", (status) => finish(status ?? 1));
  });
}

async function main() {
  const { index, count } = parseArgs(process.argv.slice(2));
  const selected = partitionWorkPacketNodeIds(collectWorkPacketNodeIds(), index, count);
  console.log(`SUPERVISOR_TEST_PARTITION work-packets index=${index}/${count} selected=${selected.length}`);
  const child = spawn(process.execPath, ["./scripts/run-supervisor-tests.mjs", "--no-preflight", "--timeout-ms=180000", "-q", ...selected], {
    cwd: rootDir,
    stdio: "inherit",
  });
  const code = await waitForWorkPacketPartition(child);
  process.exit(code);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`FAIL work-packets partition: ${error.message}`);
    process.exit(64);
  });
}
