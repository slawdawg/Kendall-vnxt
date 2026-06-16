#!/usr/bin/env node

const args = process.argv.slice(2);

function usage() {
  return `Usage: node ./scripts/linux-bootstrap.mjs --plan [options]

First-milestone Linux bootstrap orchestrator.

Options:
  --plan              Print the staged plan. This is the only supported mode.
  --target <alias>    SSH target alias. Default: kendall-linux.
  --user <name>       Expected Linux user. Default: slaw_dawg.
  --hostname <name>   Expected target hostname. Default: Kendall_vNxt.
  -h, --help          Show this help.

Apply, remote verification, package install, SSH key install, GitHub auth, and
reboot modes are intentionally unavailable in this milestone.`;
}

function fail(message, code = 2) {
  console.error(message);
  console.error("");
  console.error(usage());
  process.exit(code);
}

let mode = null;
let target = "kendall-linux";
let user = "slaw_dawg";
let hostname = "Kendall_vNxt";

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  switch (arg) {
    case "--plan":
      mode = "plan";
      break;
    case "--target":
      target = args[index + 1];
      index += 1;
      break;
    case "--user":
      user = args[index + 1];
      index += 1;
      break;
    case "--hostname":
      hostname = args[index + 1];
      index += 1;
      break;
    case "--verify-only":
    case "--apply":
    case "--install-key":
    case "--reboot":
      fail(`${arg} is gated and not implemented in the first milestone.`);
      break;
    case "-h":
    case "--help":
      console.log(usage());
      process.exit(0);
      break;
    default:
      fail(`Unsupported argument: ${arg}`);
  }
}

if (mode !== "plan") {
  fail("This first-milestone orchestrator only supports --plan.");
}

for (const [name, value] of Object.entries({ target, user, hostname })) {
  if (!value || value.startsWith("--")) {
    fail(`Missing value for ${name}.`);
  }
}

const plan = {
  schema: "kendall-linux-bootstrap-plan/v1",
  mode: "plan",
  target: {
    alias: target,
    user,
    hostname,
    durableIdentity: "ssh-alias",
    rawIpPolicy: "discovery-only",
  },
  stages: [
    {
      id: "local-syntax",
      command: "node --check scripts/linux-bootstrap.mjs && bash -n scripts/validate-linux-install.sh",
      mutation: "none",
    },
    {
      id: "first-ssh-trust",
      command: `ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes ${target} 'whoami; hostname; cat /etc/os-release'`,
      mutation: "known_hosts add only",
      status: "run-once-for-new-vm",
    },
    {
      id: "remote-baseline-verify",
      command: `Get-Content -Raw scripts\\validate-linux-install.sh | ssh ${target} 'bash -s -- --verify-only --user ${user} --hostname ${hostname} --skip-repo'`,
      mutation: "none",
      status: "future-gated",
    },
    {
      id: "remote-apply",
      command: "not implemented",
      mutation: "requires explicit approval packet",
      status: "blocked",
    },
    {
      id: "remote-post-apply-verify",
      command: `Get-Content -Raw scripts\\validate-linux-install.sh | ssh ${target} 'bash -s -- --verify-only --user ${user} --hostname ${hostname}'`,
      mutation: "none",
      status: "blocked-until-apply-exists",
    },
  ],
  stopLines: [
    "host-key mismatch",
    "target alias mismatch",
    "remote user is not slaw_dawg",
    "Ubuntu release is not 26.04",
    "private key input",
    "authorized_keys overwrite",
    "automated GitHub auth",
    "unexpected package/file/service mutation",
    "reboot request without separate approval",
  ],
  evidence: {
    default: "stdout redacted summary",
    fileEvidence: "requires explicit path and approved evidence location",
  },
};

console.log(JSON.stringify(plan, null, 2));
