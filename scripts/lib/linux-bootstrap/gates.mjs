function parseKeyValueLines(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index > 0) {
      values[line.slice(0, index)] = line.slice(index + 1);
    }
  }
  return values;
}

function versionAtLeast(current, minimum) {
  const currentParts = String(current).split(".").map((part) => Number.parseInt(part, 10));
  const minimumParts = String(minimum).split(".").map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < Math.max(currentParts.length, minimumParts.length); index += 1) {
    const currentValue = currentParts[index] || 0;
    const minimumValue = minimumParts[index] || 0;
    if (currentValue > minimumValue) return true;
    if (currentValue < minimumValue) return false;
  }
  return true;
}

export function buildPlanGates(options) {
  return [
    {
      id: "command-contract",
      status: "pass",
      summary: `running ${options.mode} mode from the local session`,
      recovery: "none",
      command: "parse bootstrap command arguments",
    },
  ];
}

export function localIdentityScript() {
  return [
    "set -u",
    'printf "user=%s\\n" "$(id -un)"',
    'printf "uid=%s\\n" "$(id -u)"',
    'printf "hostname=%s\\n" "$(hostname)"',
    'printf "arch=%s\\n" "$(uname -m)"',
    'printf "home=%s\\n" "$HOME"',
    'if [ -r /etc/os-release ]; then . /etc/os-release; printf "os_id=%s\\n" "${ID:-unknown}"; printf "os_version=%s\\n" "${VERSION_ID:-unknown}"; else printf "os_id=unknown\\n"; printf "os_version=unknown\\n"; fi',
    'if command -v sudo >/dev/null 2>&1; then printf "sudo=available\\n"; else printf "sudo=missing\\n"; fi',
    'df -Pk "$HOME" | while read -r filesystem blocks used available capacity mountpoint; do if [ "$filesystem" != "Filesystem" ]; then printf "disk_available_kb=%s\\n" "$available"; break; fi; done',
    'if getent hosts github.com >/dev/null 2>&1; then printf "network=github-dns-ok\\n"; else printf "network=github-dns-fail\\n"; fi',
  ].join("; ");
}

export const targetIdentityScript = localIdentityScript;

export function parseTargetIdentity(stdout) {
  return parseKeyValueLines(stdout);
}

export function validateTargetIdentity(identity, options) {
  if (options.user && identity.user !== options.user) {
    return {
      id: "local-identity",
      status: "fail",
      summary: `expected user ${options.user} but found ${identity.user || "unknown"}`,
      recovery: "Log in with the intended non-root user.",
      command: "local identity probe",
      details: { identity },
    };
  }
  if (identity.uid === "0" || identity.user === "root") {
    return {
      id: "local-identity",
      status: "fail",
      summary: "root local user is not supported",
      recovery: "Create or use a non-root Linux user with sudo access.",
      command: "local identity probe",
      details: { identity },
    };
  }
  if (options.hostname && identity.hostname !== options.hostname) {
    return {
      id: "local-identity",
      status: "fail",
      summary: `expected hostname ${options.hostname} but found ${identity.hostname || "unknown"}`,
      recovery: "Confirm this is the approved Ubuntu machine or update --hostname.",
      command: "local identity probe",
      details: { identity },
    };
  }
  if (identity.os_id !== "ubuntu" || !versionAtLeast(identity.os_version || "0", "26.04")) {
    return {
      id: "local-identity",
      status: "fail",
      summary: `expected Ubuntu 26.04 or later but found ${identity.os_id || "unknown"} ${identity.os_version || "unknown"}`,
      recovery: "Use Ubuntu 26.04 or later before running bootstrap.",
      command: "local identity probe",
      details: { identity },
    };
  }
  if (identity.sudo !== "available") {
    return {
      id: "local-identity",
      status: "fail",
      summary: "sudo is not available locally",
      recovery: "Install sudo or use a non-root user with approved sudo capability, then rerun.",
      command: "command -v sudo",
      details: { identity },
    };
  }
  const availableKb = Number.parseInt(identity.disk_available_kb || "0", 10);
  if (!Number.isFinite(availableKb) || availableKb < 5 * 1024 * 1024) {
    return {
      id: "local-identity",
      status: "fail",
      summary: `local home filesystem has insufficient free space: ${identity.disk_available_kb || "unknown"} KB available`,
      recovery: "Free at least 5 GB on the local home filesystem before bootstrap.",
      command: "df -Pk $HOME",
      details: { identity },
    };
  }
  if (identity.network !== "github-dns-ok") {
    return {
      id: "local-identity",
      status: "fail",
      summary: "local machine cannot resolve github.com",
      recovery: "Fix DNS or outbound network access before bootstrap.",
      command: "getent hosts github.com",
      details: { identity },
    };
  }

  return {
    id: "local-identity",
    status: "pass",
    summary: `local host ${identity.hostname} is Ubuntu ${identity.os_version} on ${identity.arch} as ${identity.user}`,
    recovery: "none",
    command: "local identity probe",
    details: { identity },
  };
}
