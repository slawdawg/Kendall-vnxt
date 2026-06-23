#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createDefaultConfig,
  createMemoryProposal,
  listApprovedNotes,
  runSyntheticValidation,
  validateConfig,
} from "./lib/knx-obsidian-memory.mjs";

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  process.stderr.write([
    "Usage:",
    "  node scripts/knx-obsidian-memory.mjs validate --config PATH",
    "  node scripts/knx-obsidian-memory.mjs synthetic [--work-dir PATH]",
    "  node scripts/knx-obsidian-memory.mjs propose --config PATH --note PATH",
    "",
  ].join("\n"));
}

function readConfig(path) {
  if (!path || !existsSync(path)) {
    throw new Error(`Config file not found: ${path ?? "(missing)"}`);
  }
  const text = readFileSync(path, "utf8");
  if (path.endsWith(".json")) {
    const parsed = JSON.parse(text);
    return parsed.kom ?? parsed;
  }

  const kom = {};
  let inKom = false;
  let currentList = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    if (line.trim() === "kom:") {
      inKom = true;
      currentList = null;
      continue;
    }
    if (inKom && line.length > 0 && !line.startsWith(" ")) {
      break;
    }
    if (!inKom) {
      continue;
    }
    const keyMatch = line.match(/^  ([a-zA-Z0-9_]+):\s*(.*)$/);
    if (keyMatch) {
      const [, key, rawValue] = keyMatch;
      if (rawValue === "") {
        currentList = key;
        kom[key] = [];
        continue;
      }
      currentList = null;
      kom[key] = rawValue.replace(/^["']|["']$/g, "");
      continue;
    }
    const listMatch = line.match(/^    -\s+(.+)$/);
    if (listMatch && currentList) {
      kom[currentList].push(listMatch[1].replace(/^["']|["']$/g, ""));
    }
  }
  return createDefaultConfig(kom);
}

function argValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "help") {
    usage();
    process.exit(command ? 0 : 2);
  }

  if (command === "synthetic") {
    const workDir = argValue(args, "--work-dir");
    const result = runSyntheticValidation({ workDir: workDir ? resolve(workDir) : undefined });
    printJson(result);
    process.exit(result.status === "PASS" ? 0 : 1);
  }

  if (command === "validate") {
    const configPath = argValue(args, "--config");
    const config = readConfig(configPath);
    const result = {
      ...validateConfig(config, { projectRoot: process.cwd() }),
      approved_note_count: listApprovedNotes(config, { projectRoot: process.cwd() }).notes.length,
    };
    printJson(result);
    process.exit(result.status === "FAIL" ? 1 : 0);
  }

  if (command === "propose") {
    const configPath = argValue(args, "--config");
    const notePath = argValue(args, "--note");
    const config = readConfig(configPath);
    const listed = listApprovedNotes(config, { projectRoot: process.cwd() });
    const note = listed.notes.find((candidate) => resolve(candidate.path) === resolve(notePath ?? ""));
    if (!note) {
      throw new Error("--note must point to a markdown note under allowed_read_folders");
    }
    printJson({
      status: listed.status,
      proposal: createMemoryProposal(config, note, { projectRoot: process.cwd() }),
      findings: listed.findings,
    });
    process.exit(listed.status === "FAIL" ? 1 : 0);
  }

  usage();
  process.exit(2);
} catch (error) {
  printJson({
    status: "FAIL",
    error: error.message,
  });
  process.exit(2);
}

