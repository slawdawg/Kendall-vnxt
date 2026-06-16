#!/usr/bin/env node

const args = process.argv.slice(2);

function usage() {
  return `Usage: node ./scripts/linux-bootstrap.mjs --plan [options]

First-milestone Linux bootstrap orchestrator.

Options:
  --plan              Print the staged plan. This is the only supported mode.
  --target <alias>    SSH target alias or host. Default: ubuntu-target.
  --user <name>       Optional expected Linux user. Defaults to remote current user.
  --hostname <name>   Optional expected target hostname.
  -h, --help          Show this help.

Apply, remote verification, package install, SSH key install, provider auth,
Tailnet enrollment, and reboot modes are intentionally unavailable in this
milestone.`;
}

function fail(message, code = 2) {
  console.error(message);
  console.error("");
  console.error(usage());
  process.exit(code);
}

let mode = null;
let target = "ubuntu-target";
let user = "";
let hostname = "";

function optionValue(option, index) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    fail(`Missing value for ${option}.`);
  }
  return value;
}

function validateCommandToken(name, value, pattern = /^[A-Za-z0-9._@%+=:,-]+$/) {
  if (!value) {
    return;
  }
  if (value.startsWith("-")) {
    fail(`${name} must not start with '-'.`);
  }
  if (!pattern.test(value)) {
    fail(`${name} contains unsupported characters for generated shell commands.`);
  }
}

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  switch (arg) {
    case "--plan":
      mode = "plan";
      break;
    case "--target":
      target = optionValue(arg, index);
      index += 1;
      break;
    case "--user":
      user = optionValue(arg, index);
      index += 1;
      break;
    case "--hostname":
      hostname = optionValue(arg, index);
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

for (const [name, value] of Object.entries({ target })) {
  if (!value || value.startsWith("--")) {
    fail(`Missing value for ${name}.`);
  }
}

validateCommandToken("target", target);
validateCommandToken("user", user, /^[A-Za-z0-9._-]+$/);
validateCommandToken("hostname", hostname, /^[A-Za-z0-9._-]+$/);

function verifyArgs({ includeRepo = false } = {}) {
  const scriptArgs = ["--verify-only"];
  if (user) {
    scriptArgs.push("--user", user);
  }
  if (hostname) {
    scriptArgs.push("--hostname", hostname);
  }
  if (!includeRepo) {
    scriptArgs.push("--skip-repo");
  }
  return scriptArgs.join(" ");
}

const plan = {
  schema: "kendall-linux-bootstrap-plan/v1",
  mode: "plan",
  target: {
    alias: target,
    user: user || "remote-current-user",
    hostname: hostname || "not-enforced",
    durableIdentity: "ssh-alias",
    rawIpPolicy: "discovery-only",
  },
  stages: [
    {
      id: "local-syntax",
      command: "node --check scripts/linux-bootstrap.mjs && bash -n scripts/bootstrap-linux.sh scripts/validate-linux-install.sh",
      mutation: "none",
    },
    {
      id: "first-ssh-trust",
      command: `ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes ${target} 'whoami; hostname; cat /etc/os-release'`,
      mutation: "known_hosts add only",
      status: "run-once-for-new-host",
    },
    {
      id: "remote-baseline-verify",
      command: `Get-Content -Raw scripts\\validate-linux-install.sh | ssh ${target} 'bash -s -- ${verifyArgs()}'`,
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
      command: `Get-Content -Raw scripts\\validate-linux-install.sh | ssh ${target} 'bash -s -- ${verifyArgs({ includeRepo: true })}'`,
      mutation: "none",
      status: "blocked-until-apply-exists",
    },
  ],
  stopLines: [
    "host-key mismatch",
    "target alias mismatch",
    "remote user does not match --user when --user is provided",
    "Ubuntu release is older than 26.04",
    "private key input",
    "authorized_keys overwrite",
    "automated provider, repository-service, or Tailnet auth",
    "unexpected package/file/service mutation",
    "reboot request without separate approval",
  ],
  evidence: {
    default: "stdout redacted summary",
    fileEvidence: "requires explicit path and approved evidence location",
  },
};

console.log(JSON.stringify(plan, null, 2));
