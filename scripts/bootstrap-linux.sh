#!/usr/bin/env bash
set -euo pipefail

mode=""
expected_user="$(id -un 2>/dev/null || printf unknown)"
minimum_os_version="26.04"
install_pnpm_version="11.5.2"
install_uv="yes"
minimum_node_major="22"
maximum_node_major_exclusive="25"

usage() {
  cat <<'USAGE'
Usage: scripts/bootstrap-linux.sh --dry-run|--verify-only|--install-toolchain|--install-agent-clis [options]

Interactive Ubuntu toolchain bootstrap for Kendall Vnxt.

Modes:
  --dry-run              Print planned actions and exit.
  --verify-only          Verify supported OS/user and installed tool versions.
  --install-toolchain    Install Node/npm, pnpm, uv, gh, and build prerequisites.
  --install-agent-clis   Install Codex CLI, Claude Code, and BMAD Method through npm.

Options:
  --user <name>          Expected Linux user. Default: current user.
  --min-os-version <ver> Minimum Ubuntu VERSION_ID. Default: 26.04.
  --os-version <ver>     Alias for --min-os-version.
  --pnpm-version <ver>   pnpm version to install globally. Default: 11.5.2.
  --skip-uv              Do not install uv.
  -h, --help             Show this help.

This script does not clone repos, run BMAD project install/upgrade, authenticate
GitHub/OpenAI/Anthropic, copy SSH private keys, edit SSH server config, start
long-running services, or reboot.
USAGE
}

log() {
  printf '[bootstrap-linux] %s\n' "$*"
}

fail() {
  printf '[bootstrap-linux] ERROR: %s\n' "$*" >&2
  exit 1
}

version_at_least() {
  current="$1"
  minimum="$2"
  first="$(printf '%s\n%s\n' "$minimum" "$current" | sort -V | head -n 1)"
  [ "$first" = "$minimum" ]
}

node_major_version() {
  node --version 2>/dev/null | sed 's/^v//' | cut -d. -f1
}

check_node_range() {
  major="$(node_major_version || true)"
  if [ -z "$major" ]; then
    return 1
  fi
  [ "$major" -ge "$minimum_node_major" ] && [ "$major" -lt "$maximum_node_major_exclusive" ]
}

require_supported_target() {
  if [ "$(id -u)" = "0" ]; then
    fail "root is not a supported bootstrap user. Run as the intended non-root Linux user."
  fi

  if [ "$expected_user" = "root" ]; then
    fail "expected user must be a non-root Linux user"
  fi

  if [ "$(id -un)" != "$expected_user" ]; then
    fail "expected user $expected_user but found $(id -un)"
  fi

  if [ ! -r /etc/os-release ]; then
    fail "/etc/os-release is not readable"
  fi

  # shellcheck disable=SC1091
  . /etc/os-release
  if [ "${ID:-}" != "ubuntu" ] || ! version_at_least "${VERSION_ID:-0}" "$minimum_os_version"; then
    fail "expected Ubuntu $minimum_os_version or later but found ${ID:-unknown} ${VERSION_ID:-unknown}"
  fi
}

require_interactive_sudo() {
  if sudo -n true >/dev/null 2>&1; then
    return
  fi

  if [ ! -t 0 ]; then
    fail "sudo requires a password, but this session is not interactive. Run through an interactive SSH terminal."
  fi

  log "sudo requires authentication. Enter the Linux user password if prompted."
  sudo -v
}

print_versions() {
  result=0
  if [ "$#" -eq 0 ]; then
    set -- git node npm pnpm uv gh codex claude bmad-method
  fi

  for tool in "$@"; do
    if command -v "$tool" >/dev/null 2>&1; then
      if version_output="$("$tool" --version 2>/dev/null)"; then
        version="$(printf '%s\n' "$version_output" | head -n 1)"
        if [ -n "$version" ]; then
          if [ "$tool" = "node" ] && ! check_node_range; then
            printf '%s version mismatch: expected >=%s < %s but found %s\n' "$tool" "$minimum_node_major" "$maximum_node_major_exclusive" "$version"
            result=1
          elif [ "$tool" = "pnpm" ] && [ "$version" != "$install_pnpm_version" ]; then
            printf '%s version mismatch: expected %s but found %s\n' "$tool" "$install_pnpm_version" "$version"
            result=1
          else
            printf '%s\n' "$version"
          fi
        else
          printf '%s version check returned no output\n' "$tool"
          result=1
        fi
      else
        printf '%s version check failed\n' "$tool"
        result=1
      fi
    else
      printf '%s missing\n' "$tool"
      result=1
    fi
  done
  return "$result"
}

require_option_value() {
  option="$1"
  value="${2-}"
  if [ -z "$value" ]; then
    fail "missing value for $option"
  fi
}

install_agent_clis() {
  require_supported_target
  require_interactive_sudo

  if ! command -v npm >/dev/null 2>&1; then
    fail "npm is required before installing agent CLIs. Run --install-toolchain first."
  fi

  log "Installing Codex CLI, Claude Code, and BMAD Method globally through npm."
  sudo npm install -g @openai/codex @anthropic-ai/claude-code bmad-method

  log "Agent CLI install complete. Versions:"
  for tool in codex claude bmad-method; do
    if command -v "$tool" >/dev/null 2>&1; then
      "$tool" --version 2>/dev/null | head -n 1 || true
    else
      printf '%s missing\n' "$tool"
    fi
  done
}

install_toolchain() {
  require_supported_target
  require_interactive_sudo

  log "Updating apt package metadata."
  sudo apt-get update

  log "Installing Ubuntu packages: nodejs npm gh build-essential python3-venv curl ca-certificates git."
  sudo apt-get install -y nodejs npm gh build-essential python3-venv curl ca-certificates git

  if ! check_node_range; then
    fail "node must be >=$minimum_node_major < $maximum_node_major_exclusive for Kendall Vnxt. Install a supported Node channel before continuing."
  fi

  log "Installing pnpm@$install_pnpm_version globally through npm."
  sudo npm install -g "pnpm@$install_pnpm_version"

  if [ "$install_uv" = "yes" ]; then
    log "Installing uv for the current user."
    curl -LsSf https://astral.sh/uv/install.sh | sh

    if [ -x "$HOME/.local/bin/uv" ] && ! command -v uv >/dev/null 2>&1; then
      log "Adding system-visible uv symlink at /usr/local/bin/uv."
      sudo ln -sf "$HOME/.local/bin/uv" /usr/local/bin/uv
    fi

    if [ -x "$HOME/.local/bin/uvx" ] && ! command -v uvx >/dev/null 2>&1; then
      log "Adding system-visible uvx symlink at /usr/local/bin/uvx."
      sudo ln -sf "$HOME/.local/bin/uvx" /usr/local/bin/uvx
    fi
  fi

  log "Toolchain install complete. Versions:"
  if [ "$install_uv" = "yes" ]; then
    print_versions git node npm pnpm uv gh
  else
    print_versions git node npm pnpm gh
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run|--verify-only|--install-toolchain|--install-agent-clis)
      mode="$1"
      shift
      ;;
    --user)
      require_option_value "$1" "${2-}"
      expected_user="$2"
      shift 2
      ;;
    --min-os-version|--os-version)
      require_option_value "$1" "${2-}"
      minimum_os_version="$2"
      shift 2
      ;;
    --pnpm-version)
      require_option_value "$1" "${2-}"
      install_pnpm_version="$2"
      shift 2
      ;;
    --skip-uv)
      install_uv="no"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unsupported argument: $1"
      ;;
  esac
done

case "$mode" in
  --dry-run)
    require_supported_target
    cat <<EOF
Planned actions:
- Verify Ubuntu $minimum_os_version or later and user $expected_user.
- Prompt for sudo if required.
- apt-get update.
- apt-get install -y nodejs npm gh build-essential python3-venv curl ca-certificates git.
- Verify node is >=$minimum_node_major < $maximum_node_major_exclusive.
- sudo npm install -g pnpm@$install_pnpm_version.
- Install uv for the current user unless --skip-uv is set.
- Add /usr/local/bin uv/uvx symlinks if needed.
- Install Codex CLI, Claude Code, and BMAD Method only when --install-agent-clis is run.

No repo clone, BMAD project install/upgrade, GitHub/OpenAI/Anthropic auth, SSH
private key copy, service start, or reboot.
EOF
    ;;
  --verify-only)
    require_supported_target
    if [ "$install_uv" = "yes" ]; then
      print_versions git node npm pnpm uv gh codex claude bmad-method
    else
      print_versions git node npm pnpm gh codex claude bmad-method
    fi
    ;;
  --install-toolchain)
    install_toolchain
    ;;
  --install-agent-clis)
    install_agent_clis
    ;;
  "")
    usage >&2
    exit 2
    ;;
  *)
    fail "unsupported mode: $mode"
    ;;
esac
