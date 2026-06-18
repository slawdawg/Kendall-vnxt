#!/usr/bin/env bash
set -euo pipefail

mode=""
expected_user="$(id -un 2>/dev/null || printf unknown)"
minimum_os_version="26.04"
install_pnpm_version="11.5.2"
install_uv="yes"
minimum_node_major="22"
maximum_node_major_exclusive="25"
repo_url="https://github.com/slawdawg/Kendall-vnxt.git"
repo_path="${HOME:-/home/$expected_user}/Kendall_Nxt"
mutation_entries=""
tool_change_entries=""

usage() {
  cat <<'USAGE'
Usage: scripts/bootstrap-linux.sh --install-kendall-vnxt [options]

Interactive Ubuntu bootstrap for Kendall Vnxt.

Modes:
  --install-kendall-vnxt Install toolchain, agent CLIs, clone/validate repo, run setup, and verify.

Options:
  --user <name>          Expected Linux user. Default: current user.
  --min-os-version <ver> Minimum Ubuntu VERSION_ID. Default: 26.04.
  --os-version <ver>     Alias for --min-os-version.
  --pnpm-version <ver>   pnpm version to install globally. Default: 11.5.2.
  --repo-url <url>        Git repository URL. Default: Kendall Vnxt HTTPS repo.
  --repo-path <path>      Repo checkout path. Default: $HOME/Kendall_Nxt.
  --skip-uv              Do not install uv.
  -h, --help             Show this help.

This script does not authenticate GitHub/OpenAI/Anthropic, copy SSH private
keys, edit SSH server config, start long-running services, or reboot.
USAGE
}

log() {
  printf '[bootstrap-linux] %s\n' "$*" >&2
}

fail() {
  printf '[bootstrap-linux] ERROR: %s\n' "$*" >&2
  exit 1
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

add_mutation() {
  mutation="$1"
  case ",$mutation_entries," in
    *",$mutation,"*) ;;
    *)
      if [ -z "$mutation_entries" ]; then
        mutation_entries="$mutation"
      else
        mutation_entries="$mutation_entries,$mutation"
      fi
      ;;
  esac
}

mutation_json_array() {
  extra_mutation="${1:-}"
  entries="$mutation_entries"

  if [ -n "$extra_mutation" ]; then
    case ",$entries," in
      *",$extra_mutation,"*) ;;
      *)
        if [ -z "$entries" ]; then
          entries="$extra_mutation"
        else
          entries="$entries,$extra_mutation"
        fi
        ;;
    esac
  fi

  if [ -z "$entries" ]; then
    printf '[]'
    return
  fi

  printf '['
  old_ifs="$IFS"
  IFS=,
  first="yes"
  for entry in $entries; do
    if [ "$first" = "yes" ]; then
      first="no"
    else
      printf ','
    fi
    printf '"%s"' "$(json_escape "$entry")"
  done
  IFS="$old_ifs"
  printf ']'
}

record_tool_change() {
  id="$1"
  status="$2"
  summary="$3"
  row="$(printf '{"id":"%s","status":"%s","summary":"%s"}' \
    "$(json_escape "$id")" \
    "$(json_escape "$status")" \
    "$(json_escape "$summary")")"

  if [ -z "$tool_change_entries" ]; then
    tool_change_entries="$row"
  else
    tool_change_entries="$tool_change_entries,$row"
  fi
}

tool_changes_json() {
  if [ -z "$tool_change_entries" ]; then
    printf '[]'
  else
    printf '[%s]' "$tool_change_entries"
  fi
}

tool_version() {
  tool="$1"
  shift
  if command -v "$tool" >/dev/null 2>&1; then
    "$@" 2>/dev/null | head -n 1 || true
  fi
}

record_command_tool_change() {
  id="$1"
  before="$2"
  after="$3"

  if [ -z "$after" ]; then
    record_tool_change "$id" "failed" "$id is still unavailable after the approved install step"
  elif [ -z "$before" ]; then
    record_tool_change "$id" "installed" "$id installed or became available: $after"
  elif [ "$before" != "$after" ]; then
    record_tool_change "$id" "changed" "$id changed from $before to $after"
  else
    record_tool_change "$id" "existing" "$id already present: $after"
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
    fail "sudo requires a password, but this session is not interactive. Run from an interactive local Ubuntu terminal."
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

github_repo_slug() {
  url="$1"
  case "$url" in
    https://github.com/*/*.git)
      slug="${url#https://github.com/}"
      printf '%s\n' "${slug%.git}"
      ;;
    git@github.com:*/*.git)
      slug="${url#git@github.com:}"
      printf '%s\n' "${slug%.git}"
      ;;
    https://github.com/*/*)
      printf '%s\n' "${url#https://github.com/}"
      ;;
    *)
      return 1
      ;;
  esac
}

repo_url_matches_expected() {
  expected_url="$1"
  actual_url="$2"

  if [ "$actual_url" = "$expected_url" ]; then
    return 0
  fi

  if expected_slug="$(github_repo_slug "$expected_url")" && actual_slug="$(github_repo_slug "$actual_url")"; then
    [ "$expected_slug" = "$actual_slug" ]
    return
  fi

  return 1
}

next_evidence_path() {
  evidence_dir="$1"
  evidence_stamp="$2"
  base="$evidence_dir/local-install-${evidence_stamp}"
  candidate="${base}.json"
  index=1

  while [ -e "$candidate" ]; do
    candidate="${base}-${index}.json"
    index=$((index + 1))
  done

  printf '%s\n' "$candidate"
}

write_install_outcome_evidence() {
  evidence_path="$1"
  check_id="$2"
  check_status="$3"
  result="$4"
  summary="$5"
  rerun_guidance="$6"

  generated_at="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
  current_user="$(id -un 2>/dev/null || printf unknown)"
  current_hostname="$(hostname 2>/dev/null || printf unknown)"
  manual_tasks_json='[{"id":"tailscale-login","status":"manual-post-install","summary":"Enroll or log in to Tailscale only after base bootstrap if the workflow needs Tailnet access."},{"id":"codex-login","status":"manual-post-install","summary":"Run Codex login manually only after deployment if an interactive Codex workflow needs it."},{"id":"claude-login","status":"manual-post-install","summary":"Run Claude login manually only after deployment if a Claude workflow needs it."},{"id":"provider-auth","status":"manual-post-install","summary":"Configure provider authentication manually only after a separately approved workflow needs provider calls."}]'
  auth_boundary_json='{"performed_provider_login":false,"performed_tailscale_login":false,"performed_codex_login":false,"performed_claude_login":false,"performed_browser_auth":false,"read_or_wrote_provider_tokens":false}'
  tool_changes="$(tool_changes_json)"
  fail_count=0
  blocked_count=0
  if [ "$check_status" = "fail" ]; then
    fail_count=1
  fi
  if [ "$check_status" = "blocked" ]; then
    blocked_count=1
  fi
  mutations_json="$(mutation_json_array)"
  authority_level="verify"
  if [ "$evidence_path" != "-" ]; then
    mutations_json="$(mutation_json_array "evidence-file")"
    authority_level="evidence-write"
  fi

  evidence_json="$(printf '{"schema":"kendall-linux-install-evidence/v1","generated_at":"%s","mode":"verify","command":{"mode":"verify","invoked":"%s"},"target":{"alias":"local","user":"%s","hostname":"%s","repo":"%s","repo_url":"%s","minimumOsVersion":"%s","nodeRange":">=%s <%s","address_source":"local-session"},"authority":{"level":"%s","approval_id":null},"checks":[{"id":"%s","status":"%s","summary":"%s"}],"checks_summary":{"pass":0,"fail":%s,"warn":0,"blocked":%s},"tool_changes":%s,"mutations":%s,"redactions":["gh-auth-output","environment","authorized-keys","provider-tokens","private-keys"],"manual_tasks":%s,"auth_boundary":%s,"result":"%s","rerun_guidance":"%s"}\n' \
    "$(json_escape "$generated_at")" \
    "$(json_escape "scripts/bootstrap-linux.sh --install-kendall-vnxt")" \
    "$(json_escape "$current_user")" \
    "$(json_escape "$current_hostname")" \
    "$(json_escape "$repo_path")" \
    "$(json_escape "$repo_url")" \
    "$(json_escape "$minimum_os_version")" \
    "$(json_escape "$minimum_node_major")" \
    "$(json_escape "$maximum_node_major_exclusive")" \
    "$(json_escape "$authority_level")" \
    "$(json_escape "$check_id")" \
    "$(json_escape "$check_status")" \
    "$(json_escape "$summary")" \
    "$fail_count" \
    "$blocked_count" \
    "$tool_changes" \
    "$mutations_json" \
    "$manual_tasks_json" \
    "$auth_boundary_json" \
    "$(json_escape "$result")" \
    "$(json_escape "$rerun_guidance")")"

  if [ "$evidence_path" = "-" ]; then
    printf '%s' "$evidence_json"
  else
    printf '%s' "$evidence_json" > "$evidence_path"
  fi
}

write_install_failure_evidence() {
  write_install_outcome_evidence "$1" "$2" "fail" "fail" "$3" "$4"
}

write_install_blocked_stdout_evidence() {
  write_install_outcome_evidence "-" "$1" "blocked" "blocked" "$2" "$3"
}

install_agent_clis() {
  require_supported_target
  require_interactive_sudo
  codex_before="$(tool_version codex codex --version)"
  claude_before="$(tool_version claude claude --version)"
  bmad_before="$(tool_version bmad-method bmad-method --version)"

  if ! command -v npm >/dev/null 2>&1; then
    fail "npm is required before installing agent CLIs. Rerun the supported --install-kendall-vnxt bootstrap after the toolchain step is available."
  fi

  packages=""
  if ! command -v codex >/dev/null 2>&1; then
    packages="$packages @openai/codex"
  fi
  if ! command -v claude >/dev/null 2>&1; then
    packages="$packages @anthropic-ai/claude-code"
  fi
  if ! command -v bmad-method >/dev/null 2>&1; then
    packages="$packages bmad-method"
  fi

  if [ -n "$packages" ]; then
    # shellcheck disable=SC2086
    if ! sudo npm install -g $packages >&2; then
      [ -z "$codex_before" ] && record_tool_change "codex" "failed" "Codex CLI install failed before it became available"
      [ -z "$claude_before" ] && record_tool_change "claude" "failed" "Claude Code install failed before it became available"
      [ -z "$bmad_before" ] && record_tool_change "bmad-method" "failed" "BMAD Method install failed before it became available"
      fail "failed to install required agent CLIs through npm. Resolve npm/network/package access, then rerun the same single install command."
    fi
  else
    log "Codex CLI, Claude Code, and BMAD Method already exist; skipping npm global install."
  fi
  codex_after="$(tool_version codex codex --version)"
  claude_after="$(tool_version claude claude --version)"
  bmad_after="$(tool_version bmad-method bmad-method --version)"
  record_command_tool_change "codex" "$codex_before" "$codex_after"
  record_command_tool_change "claude" "$claude_before" "$claude_after"
  record_command_tool_change "bmad-method" "$bmad_before" "$bmad_after"

  log "Agent CLI install complete. Versions:"
  for tool in codex claude bmad-method; do
    if command -v "$tool" >/dev/null 2>&1; then
      "$tool" --version 2>/dev/null | head -n 1 >&2 || true
    else
      printf '%s missing\n' "$tool" >&2
    fi
  done
  add_mutation "agent-cli-install"
}

install_toolchain() {
  require_supported_target
  require_interactive_sudo
  git_before="$(tool_version git git --version)"
  node_before="$(tool_version node node --version)"
  npm_before="$(tool_version npm npm --version)"
  pnpm_before="$(tool_version pnpm pnpm --version)"
  uv_before="$(tool_version uv uv --version)"
  uvx_before="$(tool_version uvx uvx --version)"
  gh_before="$(tool_version gh gh --version)"

  log "Updating apt package metadata."
  if ! sudo apt-get update >&2; then
    fail "failed to update apt package metadata. Resolve Ubuntu package network or repository access, then rerun the same single install command."
  fi

  log "Installing Ubuntu packages: nodejs npm gh build-essential python3-venv curl ca-certificates git."
  if ! sudo apt-get install -y nodejs npm gh build-essential python3-venv curl ca-certificates git >&2; then
    fail "failed to install approved Ubuntu packages. Resolve apt package availability, then rerun the same single install command."
  fi

  if ! check_node_range; then
    node_after="$(tool_version node node --version)"
    record_tool_change "node" "failed" "node must be >=$minimum_node_major < $maximum_node_major_exclusive but found ${node_after:-missing}"
    fail "node must be >=$minimum_node_major < $maximum_node_major_exclusive for Kendall Vnxt. The Ubuntu package channel did not provide a supported version; update this bootstrap script to install an approved Node channel, then rerun the same single install command."
  fi
  git_after="$(tool_version git git --version)"
  node_after="$(tool_version node node --version)"
  npm_after="$(tool_version npm npm --version)"
  gh_after="$(tool_version gh gh --version)"
  record_command_tool_change "git" "$git_before" "$git_after"
  record_command_tool_change "node" "$node_before" "$node_after"
  record_command_tool_change "npm" "$npm_before" "$npm_after"
  record_command_tool_change "gh" "$gh_before" "$gh_after"

  current_pnpm_version=""
  if command -v pnpm >/dev/null 2>&1; then
    current_pnpm_version="$(pnpm --version 2>/dev/null | head -n 1 || true)"
  fi

  if [ "$current_pnpm_version" = "$install_pnpm_version" ]; then
    log "pnpm@$install_pnpm_version already installed; skipping npm global install."
  else
    log "Installing pnpm@$install_pnpm_version globally through npm."
    if ! sudo npm install -g "pnpm@$install_pnpm_version" >&2; then
      record_tool_change "pnpm" "failed" "failed to install pnpm@$install_pnpm_version"
      fail "failed to install pnpm@$install_pnpm_version through npm. Resolve npm package access, then rerun the same single install command."
    fi
  fi
  pnpm_after="$(tool_version pnpm pnpm --version)"
  record_command_tool_change "pnpm" "$pnpm_before" "$pnpm_after"

  if [ "$install_uv" = "yes" ]; then
    if command -v uv >/dev/null 2>&1 && command -v uvx >/dev/null 2>&1; then
      log "uv and uvx already exist; skipping uv installer."
    else
      log "Installing uv for the current user."
      if ! (curl -LsSf https://astral.sh/uv/install.sh | sh) >&2; then
        record_tool_change "uv" "failed" "failed to install uv"
        fail "failed to install uv. Resolve uv installer network or shell execution access, then rerun the same single install command."
      fi
    fi

    if [ -x "$HOME/.local/bin/uv" ] && ! command -v uv >/dev/null 2>&1; then
      log "Adding system-visible uv symlink at /usr/local/bin/uv."
      if ! sudo ln -sf "$HOME/.local/bin/uv" /usr/local/bin/uv; then
        record_tool_change "uv" "failed" "failed to expose uv on PATH"
        fail "failed to expose uv on PATH. Resolve sudo/path permissions, then rerun the same single install command."
      fi
    fi

    if [ -x "$HOME/.local/bin/uvx" ] && ! command -v uvx >/dev/null 2>&1; then
      log "Adding system-visible uvx symlink at /usr/local/bin/uvx."
      if ! sudo ln -sf "$HOME/.local/bin/uvx" /usr/local/bin/uvx; then
        record_tool_change "uvx" "failed" "failed to expose uvx on PATH"
        fail "failed to expose uvx on PATH. Resolve sudo/path permissions, then rerun the same single install command."
      fi
    fi
    uv_after="$(tool_version uv uv --version)"
    uvx_after="$(tool_version uvx uvx --version)"
    record_command_tool_change "uv" "$uv_before" "$uv_after"
    record_command_tool_change "uvx" "$uvx_before" "$uvx_after"
  else
    record_tool_change "uv" "skipped" "uv install skipped by --skip-uv"
    record_tool_change "uvx" "skipped" "uvx install skipped by --skip-uv"
  fi

  log "Toolchain install complete. Versions:"
  if [ "$install_uv" = "yes" ]; then
    print_versions git node npm pnpm uv gh >&2
  else
    print_versions git node npm pnpm gh >&2
  fi
  add_mutation "approved-package-tool-install"
}

ensure_repo() {
  require_supported_target

  if [ -d "$repo_path/.git" ]; then
    log "Kendall Vnxt repo already exists at $repo_path."
    existing_origin="$(git -C "$repo_path" remote get-url origin 2>/dev/null || true)"
    if [ -z "$existing_origin" ]; then
      fail "repo at $repo_path has no origin remote; refusing to treat it as Kendall Vnxt."
    fi
    if ! repo_url_matches_expected "$repo_url" "$existing_origin"; then
      fail "repo at $repo_path has origin $existing_origin, expected $repo_url; refusing to run setup against the wrong repo."
    fi
    if ! git -C "$repo_path" status --short --branch >/dev/null; then
      fail "repo at $repo_path failed git status validation; resolve the checkout state, then rerun the same single install command."
    fi
    return
  fi

  if [ -e "$repo_path" ]; then
    fail "repo path exists but is not a git checkout: $repo_path. Move or fix that path, then rerun the same single install command."
  fi

  log "Checking repo access without interactive Git prompts."
  if ! GIT_TERMINAL_PROMPT=0 git ls-remote "$repo_url" HEAD >/dev/null 2>&1; then
    if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
      if repo_slug="$(github_repo_slug "$repo_url")"; then
        log "Git ls-remote failed but gh auth is available; cloning $repo_slug with gh."
        if ! gh repo clone "$repo_slug" "$repo_path"; then
          fail "failed to clone $repo_slug through GitHub CLI to $repo_path. Resolve repository access or path state, then rerun the same single install command."
        fi
      else
        fail "repo access is not available for $repo_url and the URL cannot be converted to a GitHub repo slug for gh clone."
      fi
      return
    fi
    write_install_blocked_stdout_evidence \
      "repo-access" \
      "repo access is not available without manual GitHub auth" \
      "Complete GitHub auth manually as the local user, then rerun the same supported local bootstrap command."
    fail "repo access is not available. Complete GitHub auth manually as the local user, then rerun."
  fi

  log "Cloning Kendall Vnxt repo to $repo_path."
  if ! git clone "$repo_url" "$repo_path"; then
    fail "failed to clone $repo_url to $repo_path. Resolve repository access or path state, then rerun the same single install command."
  fi
}

install_kendall_vnxt() {
  install_toolchain
  install_agent_clis
  ensure_repo
  add_mutation "repo-clone-or-validate"

  evidence_dir="$repo_path/docs/linux-install/evidence"
  evidence_stamp="$(date -u +"%Y%m%dT%H%M%SZ")"

  if [ ! -d "$evidence_dir" ]; then
    fail "approved evidence directory is missing after repo setup: $evidence_dir"
  fi

  evidence_path="$(next_evidence_path "$evidence_dir" "$evidence_stamp")"

  log "Running project setup."
  if ! (cd "$repo_path" && pnpm run setup); then
    log "Project setup failed; writing failure evidence to $evidence_path."
    write_install_failure_evidence \
      "$evidence_path" \
      "project-setup" \
      "pnpm run setup failed after repo validation" \
      "Fix the setup failure, then rerun the same supported local bootstrap command."
    fail "pnpm run setup failed. Evidence written to $evidence_path"
  fi
  add_mutation "project-setup"

  log "Running final Linux install validation and writing evidence to $evidence_path."
  if ! (
    cd "$repo_path" &&
      bash scripts/validate-linux-install.sh \
        --verify-only \
        --alias local \
        --address-source local-session \
        --repo-url "$repo_url" \
        --tool-changes-json "$(tool_changes_json)" \
        --evidence "$evidence_path"
  ); then
    fail "final Linux install validation failed; inspect evidence at $evidence_path, fix failed checks, then rerun the same single install command."
  fi
}

main() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --install-kendall-vnxt)
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
      --repo-url)
        require_option_value "$1" "${2-}"
        repo_url="$2"
        shift 2
        ;;
      --repo-path)
        require_option_value "$1" "${2-}"
        repo_path="$2"
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
    --install-kendall-vnxt)
      install_kendall_vnxt
      ;;
    "")
      usage >&2
      exit 2
      ;;
    *)
      fail "unsupported mode: $mode"
      ;;
  esac
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
