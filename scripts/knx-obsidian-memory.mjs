#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assessLiveReadiness,
  createDefaultConfig,
  createApprovedDraftWriteBack,
  createCustomerContactBrief,
  createLiveReadinessTemplate,
  createLiveReadOnlyProof,
  createLiveOperatorHandoffPacket,
  createDashboardMemoryProposal,
  createDashboardProposalPersistenceApprovalPacket,
  createDashboardProposalPersistenceExecutionPlan,
  createDashboardProposalPersistencePlan,
  createDraftWriteApprovalPacket,
  createEndToEndMemoryPlan,
  createMemoryProposal,
  createMemoryHygieneReport,
  createReadOnlyProof,
  listApprovedNotes,
  normalizeConfig,
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
    "  node scripts/knx-obsidian-memory.mjs live-readiness-template",
    "  node scripts/knx-obsidian-memory.mjs live-readiness --config PATH",
    "  node scripts/knx-obsidian-memory.mjs live-handoff-packet --config PATH [--note PATH] [--work-item-id ID] [--approval-ref REF] [--approved-by NAME]",
    "  node scripts/knx-obsidian-memory.mjs live-read-only-proof --config PATH --note PATH",
    "  node scripts/knx-obsidian-memory.mjs synthetic [--work-dir PATH]",
    "  node scripts/knx-obsidian-memory.mjs propose --config PATH --note PATH",
    "  node scripts/knx-obsidian-memory.mjs proposal-persist-plan --config PATH --note PATH --work-item-id ID [--live]",
    "  node scripts/knx-obsidian-memory.mjs proposal-persist-approval-packet --plan PATH --approval-ref REF [--approved-by NAME]",
    "  node scripts/knx-obsidian-memory.mjs proposal-persist-execution-plan --packet PATH [--supervisor-url URL]",
    "  node scripts/knx-obsidian-memory.mjs draft-approval-packet --proposal PATH --approval-ref REF [--approved-by NAME]",
    "  node scripts/knx-obsidian-memory.mjs end-to-end-plan --config PATH --note PATH --work-item-id ID --approval-ref REF [--approved-by NAME] [--live]",
    "  node scripts/knx-obsidian-memory.mjs read-only-proof --config PATH --note PATH",
    "  node scripts/knx-obsidian-memory.mjs write-approved-draft --config PATH --proposal PATH [--apply]",
    "  node scripts/knx-obsidian-memory.mjs customer-brief --config PATH --customer NAME",
    "  node scripts/knx-obsidian-memory.mjs hygiene-report --config PATH",
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
    return normalizeConfig(parsed.kom ?? parsed);
  }

  return normalizeConfig(parseSimpleYamlConfig(text));
}

function cleanScalar(value) {
  return value.replace(/^["']|["']$/g, "");
}

function parseSimpleYamlConfig(text) {
  const config = {};
  const rawLines = text.split(/\r?\n/).map((line) => line.replace(/\s+$/, ""));
  const hasKomWrapper = rawLines.some((line) => line.trim() === "kom:");
  const lines = [];
  let inKom = !hasKomWrapper;
  for (const line of rawLines) {
    if (line.trim() === "" || line.trim().startsWith("#")) {
      continue;
    }
    if (hasKomWrapper && line.trim() === "kom:") {
      inKom = true;
      continue;
    }
    if (hasKomWrapper && inKom && line.length > 0 && !line.startsWith(" ")) {
      break;
    }
    if (!inKom) {
      continue;
    }
    lines.push(hasKomWrapper ? line.replace(/^  /, "") : line);
  }

  let section = null;
  let subsection = null;
  let listTarget = null;
  for (const line of lines) {
    const topMatch = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (topMatch) {
      const [, key, rawValue] = topMatch;
      subsection = null;
      listTarget = null;
      if (rawValue === "") {
        section = key;
        if (key === "allowed_read_folders" || key === "excluded_folders") {
          config[key] = [];
          listTarget = config[key];
          section = null;
        } else {
          config[section] = config[section] ?? {};
        }
      } else {
        section = null;
        config[key] = cleanScalar(rawValue);
      }
      continue;
    }

    const nestedMatch = line.match(/^  ([a-zA-Z0-9_]+):\s*(.*)$/);
    if (nestedMatch && section) {
      const [, key, rawValue] = nestedMatch;
      listTarget = null;
      if (rawValue === "") {
        subsection = key;
        config[section][subsection] = config[section][subsection] ?? {};
        if (key === "read_allowlist" || key === "excluded") {
          config[section][key] = [];
          listTarget = config[section][key];
          subsection = null;
        }
      } else {
        subsection = null;
        config[section][key] = cleanScalar(rawValue);
      }
      continue;
    }

    const deepMatch = line.match(/^    ([a-zA-Z0-9_]+):\s*(.+)$/);
    if (deepMatch && section && subsection) {
      const [, key, rawValue] = deepMatch;
      config[section][subsection][key] = cleanScalar(rawValue);
      continue;
    }

    const listMatch = line.match(/^ {2,4}-\s+(.+)$/);
    if (listMatch && listTarget) {
      listTarget.push(cleanScalar(listMatch[1]));
    }
  }
  return config;
}

function argValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function argFlag(args, name) {
  return args.includes(name);
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

  if (command === "live-readiness-template") {
    printJson(createLiveReadinessTemplate());
    process.exit(0);
  }

  if (command === "live-readiness") {
    const configPath = argValue(args, "--config");
    const config = readConfig(configPath);
    const result = assessLiveReadiness(config, { projectRoot: process.cwd() });
    printJson(result);
    process.exit(result.status === "ready" ? 0 : 1);
  }

  if (command === "live-handoff-packet") {
    const configPath = argValue(args, "--config");
    const config = readConfig(configPath);
    const result = createLiveOperatorHandoffPacket(
      config,
      {
        config_path: configPath,
        note_path: argValue(args, "--note"),
        work_item_id: argValue(args, "--work-item-id"),
        approval_ref: argValue(args, "--approval-ref"),
        approved_by: argValue(args, "--approved-by") ?? "Operator",
      },
      { projectRoot: process.cwd() },
    );
    printJson(result);
    process.exit(result.status === "ready" ? 0 : 1);
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
    const proposal = createMemoryProposal(config, note, { projectRoot: process.cwd() });
    printJson({
      status: listed.status,
      proposal,
      dashboardProposal: createDashboardMemoryProposal(config, note, {
        projectRoot: process.cwd(),
        proposalPreview: proposal,
      }),
      findings: listed.findings,
    });
    process.exit(listed.status === "FAIL" ? 1 : 0);
  }

  if (command === "read-only-proof") {
    const configPath = argValue(args, "--config");
    const notePath = argValue(args, "--note");
    const config = readConfig(configPath);
    const validation = validateConfig(config, { projectRoot: process.cwd() });
    const relativePath = notePath?.startsWith(validation.vault_root)
      ? notePath.slice(validation.vault_root.length).replace(/^\/+/, "")
      : notePath;
    const result = createReadOnlyProof(config, { relative_path: relativePath }, { projectRoot: process.cwd() });
    printJson(result);
    process.exit(result.status === "blocked" && validation.status === "FAIL" ? 1 : 0);
  }

  if (command === "proposal-persist-plan") {
    const configPath = argValue(args, "--config");
    const notePath = argValue(args, "--note");
    const workItemId = argValue(args, "--work-item-id");
    const config = readConfig(configPath);
    const validation = validateConfig(config, { projectRoot: process.cwd() });
    const relativePath = notePath?.startsWith(validation.vault_root)
      ? notePath.slice(validation.vault_root.length).replace(/^\/+/, "")
      : notePath;
    const result = createDashboardProposalPersistencePlan(
      config,
      { relative_path: relativePath, work_item_id: workItemId },
      { projectRoot: process.cwd(), live: argFlag(args, "--live") },
    );
    printJson(result);
    process.exit(result.status === "ready" ? 0 : 1);
  }

  if (command === "proposal-persist-approval-packet") {
    const planPath = argValue(args, "--plan");
    if (!planPath || !existsSync(planPath)) {
      throw new Error(`Plan file not found: ${planPath ?? "(missing)"}`);
    }
    const payload = JSON.parse(readFileSync(planPath, "utf8"));
    const result = createDashboardProposalPersistenceApprovalPacket(payload, {
      approvalRef: argValue(args, "--approval-ref"),
      approvedBy: argValue(args, "--approved-by") ?? "Operator",
    });
    printJson(result);
    process.exit(result.status === "ready" ? 0 : 1);
  }

  if (command === "proposal-persist-execution-plan") {
    const packetPath = argValue(args, "--packet");
    if (!packetPath || !existsSync(packetPath)) {
      throw new Error(`Packet file not found: ${packetPath ?? "(missing)"}`);
    }
    const payload = JSON.parse(readFileSync(packetPath, "utf8"));
    const result = createDashboardProposalPersistenceExecutionPlan(payload, {
      supervisorUrl: argValue(args, "--supervisor-url") ?? "http://127.0.0.1:8000",
    });
    printJson(result);
    process.exit(result.status === "ready" ? 0 : 1);
  }

  if (command === "live-read-only-proof") {
    const configPath = argValue(args, "--config");
    const notePath = argValue(args, "--note");
    const config = readConfig(configPath);
    const validation = validateConfig(config, { projectRoot: process.cwd() });
    const relativePath = notePath?.startsWith(validation.vault_root)
      ? notePath.slice(validation.vault_root.length).replace(/^\/+/, "")
      : notePath;
    const result = createLiveReadOnlyProof(config, { relative_path: relativePath }, { projectRoot: process.cwd() });
    printJson(result);
    process.exit(result.status === "PASS" ? 0 : 1);
  }

  if (command === "write-approved-draft") {
    const configPath = argValue(args, "--config");
    const proposalPath = argValue(args, "--proposal");
    if (!proposalPath || !existsSync(proposalPath)) {
      throw new Error(`Proposal file not found: ${proposalPath ?? "(missing)"}`);
    }
    const config = readConfig(configPath);
    const proposal = JSON.parse(readFileSync(proposalPath, "utf8"));
    const result = createApprovedDraftWriteBack(config, proposal, {
      projectRoot: process.cwd(),
      apply: argFlag(args, "--apply"),
    });
    printJson(result);
    process.exit(result.status === "blocked" ? 1 : 0);
  }

  if (command === "draft-approval-packet") {
    const proposalPath = argValue(args, "--proposal");
    if (!proposalPath || !existsSync(proposalPath)) {
      throw new Error(`Proposal file not found: ${proposalPath ?? "(missing)"}`);
    }
    const payload = JSON.parse(readFileSync(proposalPath, "utf8"));
    const proposal = payload.dashboardProposal ?? payload.supervisorRequest?.body ?? payload.data ?? payload;
    const result = createDraftWriteApprovalPacket(proposal, {
      approvalRef: argValue(args, "--approval-ref"),
      approvedBy: argValue(args, "--approved-by") ?? "Operator",
    });
    printJson(result);
    process.exit(result.status === "ready" ? 0 : 1);
  }

  if (command === "end-to-end-plan") {
    const configPath = argValue(args, "--config");
    const notePath = argValue(args, "--note");
    const workItemId = argValue(args, "--work-item-id");
    const config = readConfig(configPath);
    const validation = validateConfig(config, { projectRoot: process.cwd() });
    const relativePath = notePath?.startsWith(validation.vault_root)
      ? notePath.slice(validation.vault_root.length).replace(/^\/+/, "")
      : notePath;
    const result = createEndToEndMemoryPlan(
      config,
      {
        relative_path: relativePath,
        work_item_id: workItemId,
        approval_ref: argValue(args, "--approval-ref"),
        approved_by: argValue(args, "--approved-by") ?? "Operator",
      },
      { projectRoot: process.cwd(), live: argFlag(args, "--live") },
    );
    printJson(result);
    process.exit(result.status === "ready" ? 0 : 1);
  }

  if (command === "customer-brief") {
    const configPath = argValue(args, "--config");
    const customer = argValue(args, "--customer");
    const config = readConfig(configPath);
    const result = createCustomerContactBrief(config, { customer }, { projectRoot: process.cwd() });
    printJson(result);
    process.exit(result.status === "blocked" ? 1 : 0);
  }

  if (command === "hygiene-report") {
    const configPath = argValue(args, "--config");
    const config = readConfig(configPath);
    const result = createMemoryHygieneReport(config, { projectRoot: process.cwd() });
    printJson(result);
    process.exit(result.status === "blocked" ? 1 : 0);
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
