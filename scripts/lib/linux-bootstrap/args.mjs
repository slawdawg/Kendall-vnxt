export function usage() {
  return `Usage: node ./scripts/linux-bootstrap.mjs --plan|--verify-only [options]

Local Kendall Vnxt Ubuntu bootstrap verifier.

Modes:
  --plan              Print planned gates without writing evidence.
  --verify-only       Verify local Ubuntu readiness without mutation.

Options:
  --hostname <name>   Optional expected local hostname.
  --evidence <path>   Optional local evidence path under docs/linux-install/evidence/.
  -h, --help          Show this help.

This controller does not perform Tailscale, Codex, Claude, provider, browser, or
token authentication flows. GitHub repo auth, when required, is a manual
precondition or recovery step.`;
}

function requireValue(args, option, index) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${option}.`);
  }
  return value;
}

export function parseLinuxBootstrapArgs(args) {
  const options = {
    mode: "",
    target: "local",
    user: "",
    hostname: "",
    evidence: "",
    approvalId: "",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--plan":
      case "--verify-only": {
        const mode = arg.slice(2);
        if (options.mode && options.mode !== mode) {
          throw new Error(`Conflicting modes: --${options.mode} and ${arg}.`);
        }
        options.mode = mode;
        break;
      }
      case "--apply":
        throw new Error("--apply is not supported by linux-bootstrap.mjs. Use scripts/bootstrap-linux.sh --install-kendall-vnxt for the single supported install method.");
      case "--target":
        throw new Error("--target is not supported. Run the bootstrap locally inside Ubuntu.");
      case "--user":
        throw new Error("--user is not supported. The bootstrap uses the current local Linux user.");
      case "--hostname":
        options.hostname = requireValue(args, arg, index);
        index += 1;
        break;
      case "--evidence":
        options.evidence = requireValue(args, arg, index);
        index += 1;
        break;
      case "--approval-id":
        options.approvalId = requireValue(args, arg, index);
        index += 1;
        break;
      case "-h":
      case "--help":
        console.log(usage());
        process.exit(0);
        break;
      default:
        throw new Error(`Unsupported argument: ${arg}`);
    }
  }

  if (!options.mode) {
    throw new Error("Missing mode. Supply exactly one of --plan or --verify-only.");
  }
  if (options.hostname && !/^[A-Za-z0-9._-]+$/.test(options.hostname)) {
    throw new Error("hostname contains unsupported characters.");
  }
  if (options.mode === "plan" && options.evidence) {
    throw new Error("--plan does not write evidence because plan mode must not mutate local state.");
  }
  if (options.approvalId && !/^[A-Za-z0-9._:-]+$/.test(options.approvalId)) {
    throw new Error("approval id contains unsupported characters.");
  }
  if (options.approvalId) {
    throw new Error("--approval-id is not supported by linux-bootstrap.mjs because it does not perform install mutation.");
  }

  return options;
}
