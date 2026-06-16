#!/usr/bin/env bash
set -u

mode=""
expected_user="slaw_dawg"
expected_os_version="26.04"
expected_hostname="Kendall_vNxt"
repo_path="/home/slaw_dawg/Kendall_Nxt"
run_preflight="yes"
json="no"
evidence_path=""

checks_passed=0
checks_failed=0
checks_warned=0

usage() {
  cat <<'USAGE'
Usage: scripts/validate-linux-install.sh --verify-only [options]

Verify-only Linux install readiness checks. This script does not install
packages, edit files, alter SSH configuration, authenticate GitHub, or reboot.

Options:
  --verify-only             Required mode for v1.
  --user <name>             Expected Linux user. Default: slaw_dawg.
  --os-version <version>    Expected Ubuntu VERSION_ID. Default: 26.04.
  --hostname <name>         Expected target hostname. Default: Kendall_vNxt.
  --repo <path>             Kendall_Nxt repo path. Default: /home/slaw_dawg/Kendall_Nxt.
  --skip-repo               Skip repo presence and preflight checks.
  --skip-preflight          Check repo presence but skip pnpm preflight.
  --json                    Emit a compact JSON summary.
  --evidence <path>         Write the same redacted JSON summary to this path.
  -h, --help                Show this help.
USAGE
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

record() {
  status="$1"
  id="$2"
  summary="$3"

  case "$status" in
    pass) checks_passed=$((checks_passed + 1)) ;;
    fail) checks_failed=$((checks_failed + 1)) ;;
    warn) checks_warned=$((checks_warned + 1)) ;;
  esac

  if [ "$json" != "yes" ]; then
    printf '%s %s - %s\n' "$status" "$id" "$summary"
  fi
}

run_version_check() {
  tool="$1"
  command="$2"
  if command -v "$tool" >/dev/null 2>&1; then
    version="$($command 2>/dev/null | head -n 1)"
    record pass "$tool" "$version"
  else
    record fail "$tool" "$tool is not available on PATH"
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --verify-only)
      mode="verify"
      shift
      ;;
    --user)
      expected_user="${2:-}"
      shift 2
      ;;
    --os-version)
      expected_os_version="${2:-}"
      shift 2
      ;;
    --hostname)
      expected_hostname="${2:-}"
      shift 2
      ;;
    --repo)
      repo_path="${2:-}"
      shift 2
      ;;
    --skip-repo)
      repo_path=""
      shift
      ;;
    --skip-preflight)
      run_preflight="no"
      shift
      ;;
    --json)
      json="yes"
      shift
      ;;
    --evidence)
      evidence_path="${2:-}"
      json="yes"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unsupported argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ "$mode" != "verify" ]; then
  printf 'This first-milestone script only supports --verify-only.\n' >&2
  usage >&2
  exit 2
fi

current_user="$(id -un 2>/dev/null || printf unknown)"
if [ "$current_user" = "$expected_user" ]; then
  record pass user "running as $current_user"
else
  record fail user "expected $expected_user but found $current_user"
fi

current_hostname="$(hostname 2>/dev/null || printf unknown)"
if [ "$current_hostname" = "$expected_hostname" ]; then
  record pass hostname "hostname is $current_hostname"
else
  record warn hostname "expected $expected_hostname but found $current_hostname"
fi

if [ -r /etc/os-release ]; then
  os_id="$(. /etc/os-release && printf '%s' "${ID:-unknown}")"
  os_version="$(. /etc/os-release && printf '%s' "${VERSION_ID:-unknown}")"
  if [ "$os_id" = "ubuntu" ] && [ "$os_version" = "$expected_os_version" ]; then
    record pass os-release "Ubuntu $os_version detected"
  else
    record fail os-release "expected ubuntu $expected_os_version but found $os_id $os_version"
  fi
else
  record fail os-release "/etc/os-release is not readable"
fi

run_version_check git "git --version"
run_version_check node "node --version"
run_version_check pnpm "pnpm --version"
run_version_check uv "uv --version"
run_version_check gh "gh --version"
run_version_check codex "codex --version"
run_version_check claude "claude --version"
run_version_check bmad-method "bmad-method --version"

if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    record pass github-auth "gh auth status succeeded"
  else
    record warn github-auth "manual gh auth is required or currently unavailable"
  fi
fi

if [ -n "$repo_path" ]; then
  if [ -d "$repo_path/.git" ]; then
    branch="$(git -C "$repo_path" branch --show-current 2>/dev/null || printf unknown)"
    record pass repo "repo found at $repo_path on branch $branch"
    if [ "$run_preflight" = "yes" ]; then
      if (cd "$repo_path" && pnpm run preflight >/dev/null 2>&1); then
        record pass repo-preflight "pnpm run preflight succeeded"
      else
        record fail repo-preflight "pnpm run preflight failed"
      fi
    else
      record warn repo-preflight "preflight skipped by option"
    fi
  else
    record fail repo "repo not found at $repo_path"
  fi
else
  record warn repo "repo checks skipped by option"
fi

if [ "$checks_failed" -eq 0 ]; then
  result="pass"
else
  result="fail"
fi

summary_json="$(printf '{"schema":"kendall-linux-install-evidence/v1","mode":"verify","target":{"user":"%s","hostname":"%s","repo":"%s"},"authority":{"level":"verify","approval_id":null},"checks_summary":{"pass":%s,"fail":%s,"warn":%s},"mutations":[],"redactions":["gh-auth-output","environment","authorized-keys"],"result":"%s"}\n' \
  "$(json_escape "$expected_user")" \
  "$(json_escape "$expected_hostname")" \
  "$(json_escape "$repo_path")" \
  "$checks_passed" \
  "$checks_failed" \
  "$checks_warned" \
  "$result")"

if [ "$json" = "yes" ]; then
  printf '%s' "$summary_json"
fi

if [ -n "$evidence_path" ]; then
  evidence_dir="$(dirname "$evidence_path")"
  if [ ! -d "$evidence_dir" ]; then
    printf 'Evidence directory does not exist: %s\n' "$evidence_dir" >&2
    exit 2
  fi
  printf '%s' "$summary_json" > "$evidence_path"
fi

if [ "$checks_failed" -eq 0 ]; then
  exit 0
fi

exit 1
