#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  ManagerSupervisorSourceIntakeError,
  intakeManagerSourcePacket,
} from "./lib/manager-control-plane/manager-supervisor-source-intake.mjs";

const MAX_INPUT_BYTES = 256 * 1024;

export {
  buildManagerSourceIntakeRequest,
  deriveAuthoritativePacketId,
  intakeManagerSourcePacket,
  resolveLoopbackSourceIntakeEndpoint,
} from "./lib/manager-control-plane/manager-supervisor-source-intake.mjs";

export function parseManagerSourceIntakeArgs(argv = []) {
  const options = { input: null, supervisorUrl: null };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      claimSingleton(seen, "--input");
      options.input = requiredValue(argv, ++index, arg);
    } else if (arg.startsWith("--input=")) {
      claimSingleton(seen, "--input");
      options.input = arg.slice("--input=".length);
    } else if (arg === "--supervisor-url") {
      claimSingleton(seen, "--supervisor-url");
      options.supervisorUrl = requiredValue(argv, ++index, arg);
    } else if (arg.startsWith("--supervisor-url=")) {
      claimSingleton(seen, "--supervisor-url");
      options.supervisorUrl = arg.slice("--supervisor-url=".length);
    }
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.input || !options.supervisorUrl) {
    throw new Error("Usage: manager-supervisor-source-intake --input <source-packet.json|-> --supervisor-url <loopback-url>");
  }
  return options;
}

export async function runManagerSupervisorSourceIntake(argv = process.argv.slice(2), context = {}) {
  const options = parseManagerSourceIntakeArgs(argv);
  const text = options.input === "-" ? await readStream(process.stdin) : await readFileBounded(options.input);
  return intakeManagerSourcePacket(JSON.parse(text), options.supervisorUrl, context);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await runManagerSupervisorSourceIntake(), null, 2));
  } catch (error) {
    if (error instanceof ManagerSupervisorSourceIntakeError) {
      console.log(JSON.stringify(error.packet, null, 2));
      console.error(`${error.code}: ${error.message}`);
      process.exitCode = 1;
    } else {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 64;
    }
  }
}

function requiredValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

async function readStream(stream) {
  let value = "";
  let bytes = 0;
  stream.setEncoding("utf8");
  for await (const chunk of stream) {
    bytes += Buffer.byteLength(chunk, "utf8");
    if (bytes > MAX_INPUT_BYTES) throw new Error(`Input exceeds ${MAX_INPUT_BYTES} bytes.`);
    value += chunk;
  }
  return value;
}

async function readFileBounded(path) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > MAX_INPUT_BYTES) throw new Error(`Input must be a file no larger than ${MAX_INPUT_BYTES} bytes.`);
  const value = await readFile(path, "utf8");
  if (Buffer.byteLength(value, "utf8") > MAX_INPUT_BYTES) throw new Error(`Input exceeds ${MAX_INPUT_BYTES} bytes.`);
  return value;
}

function claimSingleton(seen, option) {
  if (seen.has(option)) throw new Error(`${option} specified more than once`);
  seen.add(option);
}
