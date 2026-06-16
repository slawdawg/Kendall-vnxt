#!/usr/bin/env bash
set -u

mode=""
expected_user="$(id -un 2>/dev/null || printf unknown)"
minimum_os_version="26.04"
expected_hostname=""
expected_pnpm_version="11.5.2"
minimum_node_major="22"
maximum_node_major_exclusive="25"
repo_path="${HOME:-/home/$expected_user}/Kendall_Nxt"
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
packages, alter SSH configuration, authenticate providers, or reboot. The
optional --evidence flag writes one redacted JSON evidence file under an
approved repo evidence directory.

Options:
  --verify-only             Required mode for v1.
  --user <name>             Expected Linux user. Default: current user.
  --min-os-version <ver>    Minimum Ubuntu VERSION_ID. Default: 26.04.
  --os-version <version>    Alias for --min-os-version.
  --hostname <name>         Optional expected target hostname.
  --pnpm-version <version>  Expected pnpm version. Default: 11.5.2.
  --repo <path>             Kendall_Nxt repo path. Default: $HOME/Kendall_Nxt.
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

repo_root() {
  if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
    cd "$script_dir/.." && pwd -P
    return
  fi

  if [ -d "docs/linux-install/evidence" ]; then
    pwd -P
    return
  fi

  return 1
}

validate_evidence_path() {
  path="$1"
  root="$(repo_root)" || {
    printf 'Cannot resolve repo root for evidence path validation. Run from the repo root or use a checked-out script file.\n' >&2
    exit 2
  }
  allowed_dir="$root/docs/linux-install/evidence"
  evidence_dir="$(dirname "$path")"

  if [ ! -d "$allowed_dir" ]; then
    printf 'Approved evidence directory does not exist: %s\n' "$allowed_dir" >&2
    exit 2
  fi

  if [ ! -d "$evidence_dir" ]; then
    printf 'Evidence directory does not exist: %s\n' "$evidence_dir" >&2
    exit 2
  fi

  evidence_dir_real="$(cd "$evidence_dir" && pwd -P)"
  allowed_dir_real="$(cd "$allowed_dir" && pwd -P)"

  if [ "$evidence_dir_real" != "$allowed_dir_real" ]; then
    printf 'Evidence path must be under this checkout docs/linux-install/evidence: %s\n' "$path" >&2
    exit 2
  fi
}

run_version_check() {
  tool="$1"
  command="$2"
  expected_version="${3:-}"
  if command -v "$tool" >/dev/null 2>&1; then
    if version_output="$($command 2>/dev/null)"; then
      version="$(printf '%s\n' "$version_output" | head -n 1)"
      if [ -z "$version" ]; then
        record fail "$tool" "$command returned no version output"
      elif [ "$tool" = "node" ] && ! check_node_range; then
        record fail "$tool" "expected >=$minimum_node_major < $maximum_node_major_exclusive but found $version"
      elif [ -n "$expected_version" ] && [ "$version" != "$expected_version" ]; then
        record fail "$tool" "expected $expected_version but found $version"
      else
        record pass "$tool" "$version"
      fi
    else
      record fail "$tool" "$command failed"
    fi
  else
    record fail "$tool" "$tool is not available on PATH"
  fi
}

require_option_value() {
  option="$1"
  value="${2-}"
  if [ -z "$value" ]; then
    printf 'Missing value for %s\n' "$option" >&2
    usage >&2
    exit 2
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --verify-only)
      mode="verify"
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
    --hostname)
      require_option_value "$1" "${2-}"
      expected_hostname="$2"
      shift 2
      ;;
    --pnpm-version)
      require_option_value "$1" "${2-}"
      expected_pnpm_version="$2"
      shift 2
      ;;
    --repo)
      require_option_value "$1" "${2-}"
      repo_path="$2"
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
      require_option_value "$1" "${2-}"
      evidence_path="$2"
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

if [ -n "$evidence_path" ]; then
  validate_evidence_path "$evidence_path"
fi

current_user="$(id -un 2>/dev/null || printf unknown)"
if [ "$current_user" = "$expected_user" ]; then
  record pass user "running as $current_user"
else
  record fail user "expected $expected_user but found $current_user"
fi

current_hostname="$(hostname 2>/dev/null || printf unknown)"
if [ -z "$expected_hostname" ]; then
  record pass hostname "hostname is $current_hostname"
elif [ "$current_hostname" = "$expected_hostname" ]; then
  record pass hostname "hostname is $current_hostname"
else
  record warn hostname "expected $expected_hostname but found $current_hostname"
fi

if [ -r /etc/os-release ]; then
  os_id="$(. /etc/os-release && printf '%s' "${ID:-unknown}")"
  os_version="$(. /etc/os-release && printf '%s' "${VERSION_ID:-unknown}")"
  if [ "$os_id" = "ubuntu" ] && version_at_least "$os_version" "$minimum_os_version"; then
    record pass os-release "Ubuntu $os_version detected"
  else
    record fail os-release "expected ubuntu $minimum_os_version or later but found $os_id $os_version"
  fi
else
  record fail os-release "/etc/os-release is not readable"
fi

run_version_check git "git --version"
run_version_check node "node --version"
run_version_check pnpm "pnpm --version" "$expected_pnpm_version"
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

authority_level="verify"
mutations_json="[]"
if [ -n "$evidence_path" ]; then
  authority_level="evidence-write"
  mutations_json='["evidence-file"]'
fi

summary_json="$(printf '{"schema":"kendall-linux-install-evidence/v1","mode":"verify","target":{"user":"%s","hostname":"%s","repo":"%s","minimumOsVersion":"%s","nodeRange":">=%s <%s"},"authority":{"level":"%s","approval_id":null},"checks_summary":{"pass":%s,"fail":%s,"warn":%s},"mutations":%s,"redactions":["gh-auth-output","environment","authorized-keys"],"result":"%s"}\n' \
  "$(json_escape "$expected_user")" \
  "$(json_escape "$expected_hostname")" \
  "$(json_escape "$repo_path")" \
  "$(json_escape "$minimum_os_version")" \
  "$(json_escape "$minimum_node_major")" \
  "$(json_escape "$maximum_node_major_exclusive")" \
  "$(json_escape "$authority_level")" \
  "$checks_passed" \
  "$checks_failed" \
  "$checks_warned" \
  "$mutations_json" \
  "$result")"

if [ "$json" = "yes" ]; then
  printf '%s' "$summary_json"
fi

if [ -n "$evidence_path" ]; then
  printf '%s' "$summary_json" > "$evidence_path"
fi

if [ "$checks_failed" -eq 0 ]; then
  exit 0
fi

exit 1
