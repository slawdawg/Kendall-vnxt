#!/usr/bin/env node

import { readFileSync } from "node:fs";

const activeDocs = [
  "README.md",
  "docs/linux-install/install-playbook.md",
  "docs/linux-install/install-contract.md",
  "docs/linux-install/one-command-bootstrap-plan.md",
  "docs/linux-install/fresh-host-proof-procedure.md",
  "docs/linux-install/validation-matrix.md",
  "docs/linux-install/troubleshooting.md",
  "docs/linux-install/index.md",
];

const expectedBootstrapUrl =
  "https://raw.githubusercontent.com/slawdawg/Kendall-vnxt/main/scripts/bootstrap-linux.sh";

const requiredSnippets = [
  {
    path: "README.md",
    text: "No SSH-driven install, remote operator install, staged script workflow, manual\nfallback install, or Windows-to-Linux orchestration is supported.",
  },
  {
    path: "README.md",
    text: expectedBootstrapUrl,
  },
  {
    path: "README.md",
    text: "sudo apt-get update && sudo apt-get install -y curl ca-certificates",
  },
  {
    path: "README.md",
    text: "wget -qO \"$tmp\" \"$url\"",
  },
  {
    path: "docs/linux-install/install-playbook.md",
    text: "There is only one supported v1 install method:",
  },
  {
    path: "docs/linux-install/install-playbook.md",
    text: expectedBootstrapUrl,
  },
  {
    path: "docs/linux-install/one-command-bootstrap-plan.md",
    text: expectedBootstrapUrl,
  },
  {
    path: "scripts/check-linux-bootstrap-url.mjs",
    text: expectedBootstrapUrl,
  },
  {
    path: "docs/linux-install/index.md",
    text: "[Fresh host proof procedure](fresh-host-proof-procedure.md)",
  },
  {
    path: "docs/linux-install/index.md",
    text: "They are not the generic installer entry point and must not override the\nsingle-method v1 boundary above.",
  },
  {
    path: "docs/linux-install/fresh-host-proof-procedure.md",
    text: "Do not switch to manual multi-step install as a workaround.",
  },
  {
    path: "docs/linux-install/troubleshooting.md",
    text: "Do not switch to SSH, remote execution,\nstaged scripts, or manual multi-step install as a workaround.",
  },
  {
    path: "docs/linux-install/install-playbook.md",
    text: "sudo apt-get update && sudo apt-get install -y curl ca-certificates",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "--install-kendall-vnxt",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "Usage: scripts/bootstrap-linux.sh --install-kendall-vnxt [options]",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "--address-source local-session",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "--alias local",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "\"command\":{\"mode\":\"verify\",\"invoked\":\"%s\"}",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "base=\"$evidence_dir/local-install-${evidence_stamp}\"",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "next_evidence_path()",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "write_install_failure_evidence()",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "pnpm run setup failed after repo validation",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "candidate=\"${base}-${index}.json\"",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "github_repo_slug()",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "gh repo clone \"$repo_slug\" \"$repo_path\"",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "update this bootstrap script to install an approved Node channel, then rerun the same single install command",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "already exist; skipping npm global install",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "pnpm@$install_pnpm_version already installed; skipping npm global install.",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "uv and uvx already exist; skipping uv installer.",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "repo_url_matches_expected()",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "refusing to run setup against the wrong repo",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "--repo-url \"$repo_url\"",
  },
  {
    path: "scripts/validate-linux-install.sh",
    text: "Evidence file already exists:",
  },
  {
    path: "scripts/validate-linux-install.sh",
    text: "repo_url_matches_expected()",
  },
  {
    path: "scripts/validate-linux-install.sh",
    text: "repo-origin",
  },
  {
    path: "scripts/validate-linux-install.sh",
    text: "\"command\":{\"mode\":\"verify\",\"invoked\":\"%s\"}",
  },
  {
    path: "docs/linux-install/one-command-bootstrap-plan.md",
    text: "Publication gate: the GitHub `main` command is the supported user-facing\ncommand only after these installer changes are merged to `main`.",
  },
  {
    path: "docs/linux-install/one-command-bootstrap-plan.md",
    text: "The raw bootstrap URL must also be reachable by the intended installer audience",
  },
  {
    path: "package.json",
    text: "\"check:linux-bootstrap-url\": \"node ./scripts/check-linux-bootstrap-url.mjs\"",
  },
];

const forbiddenPatterns = [
  /SSH may be used/i,
  /terminal transport/i,
  /fallback path/i,
  /manual script fallback/i,
  /primary path:\s*one-command ssh/i,
  /supported .*remote operator path/i,
  /supported .*ssh-driven/i,
  /pnpm\s+run\s+linux:bootstrap\s+--\s+--apply/i,
  /linux-bootstrap\.mjs\s+--apply/i,
  /--target\s+<ssh/i,
  /--user\s+<linux/i,
  /StrictHostKeyChecking=accept-new/i,
];

const forbiddenScriptPatterns = [
  /--install-toolchain/,
  /--install-agent-clis/,
  /--dry-run/,
];

const failures = [];

for (const path of activeDocs) {
  const text = readFileSync(path, "utf8");
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(text)) {
      failures.push(`${path} contains forbidden install-method language: ${pattern}`);
    }
  }
}

for (const requirement of requiredSnippets) {
  const text = readFileSync(requirement.path, "utf8");
  if (!text.includes(requirement.text)) {
    failures.push(`${requirement.path} must include: ${requirement.text}`);
  }
}

{
  const script = readFileSync("scripts/bootstrap-linux.sh", "utf8");
  for (const pattern of forbiddenScriptPatterns) {
    if (pattern.test(script)) {
      failures.push(`scripts/bootstrap-linux.sh exposes forbidden staged install mode: ${pattern}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Linux install contract check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Linux install contract check passed.");
