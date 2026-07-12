#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  ManagerSupervisorTerminalEventSyncError,
  syncManagerSupervisorTerminalEvent,
} from "./lib/manager-control-plane/manager-supervisor-terminal-event-sync.mjs";

export { deriveManagerTerminalEventId, resolveLoopbackSupervisorEndpoint, syncManagerSupervisorTerminalEvent } from "./lib/manager-control-plane/manager-supervisor-terminal-event-sync.mjs";

export function parseManagerSupervisorSyncArgs(argv = []) {
  const options = { input: null, supervisorUrl: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") options.input = requiredValue(argv, ++index, arg);
    else if (arg.startsWith("--input=")) options.input = arg.slice("--input=".length);
    else if (arg === "--supervisor-url") options.supervisorUrl = requiredValue(argv, ++index, arg);
    else if (arg.startsWith("--supervisor-url=")) options.supervisorUrl = arg.slice("--supervisor-url=".length);
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.input || !options.supervisorUrl) throw new Error("Usage: manager-supervisor-terminal-event-sync --input <packet.json|-> --supervisor-url <loopback-url>");
  return options;
}

export async function runManagerSupervisorTerminalEventSync(argv = process.argv.slice(2), context = {}) {
  const options = parseManagerSupervisorSyncArgs(argv);
  const source = options.input === "-" ? process.stdin : await readFile(options.input, "utf8");
  const text = typeof source === "string" ? source : await readStream(source);
  const packet = JSON.parse(text);
  return syncManagerSupervisorTerminalEvent(packet, options.supervisorUrl, context);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await runManagerSupervisorTerminalEventSync(), null, 2));
  } catch (error) {
    if (error instanceof ManagerSupervisorTerminalEventSyncError) {
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
  stream.setEncoding("utf8");
  for await (const chunk of stream) value += chunk;
  return value;
}
