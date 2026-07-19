import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  renderLanAuthEnvironment,
  renderLanAuthUnits,
  resolveLanAuthConfig,
  legacyWasActive,
  legacyWasEnabled,
  stopLegacyCockpit,
  unitNames,
} from "../scripts/lan-auth-systemd.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "knx-lan-auth-systemd-"));
  const authDir = join(root, "auth");
  await mkdir(authDir, { mode: 0o700 });
  for (const name of ["bootstrap-password", "dashboard.crt", "dashboard.key"]) {
    await writeFile(join(authDir, name), "metadata-only-test-fixture\n", { mode: 0o600 });
  }
  return { root, authDir };
}

test("resolves a valid numeric LAN-auth configuration", async () => {
  const { root, authDir } = await fixture();
  try {
    const config = resolveLanAuthConfig({ repoRoot: root, authDir, systemdEnvFile: join(root, "lan-auth.env"), lanAddress: "192.168.1.8", validateFiles: true });
    assert.equal(config.dashboardOrigin, "https://192.168.1.8:3000");
    assert.equal(config.dashboardAllowedHost, "192.168.1.8:3000");
    assert.equal(config.supervisorUdsPath, join(authDir, "supervisor.sock"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects wildcard and loopback LAN binds before unit generation", () => {
  for (const lanAddress of ["0.0.0.0", "0.10.1.2", "::", "0:0:0:0:0:0:0:1", "::ffff:192.168.1.8", "127.0.0.1", "localhost"]) {
    assert.throws(() => resolveLanAuthConfig({ repoRoot: "/repo", authDir: "/auth", lanAddress, validateFiles: false }), /numeric|LAN address/);
  }
});

test("renders mutually exclusive user units with the private UDS environment", () => {
  const config = resolveLanAuthConfig({ repoRoot: "/home/kendall/Kendall_Nxt", authDir: "/home/kendall/kendall-lan-auth", lanAddress: "192.168.1.8", systemdEnvFile: "/home/kendall/.config/kendall/lan-auth.env", validateFiles: false });
  const units = renderLanAuthUnits({ config, pnpmPath: "/usr/bin/pnpm", uvPath: "/usr/bin/uv" });
  assert.match(units[unitNames.target], /Conflicts=kendall-cockpit\.target/);
  assert.match(units[unitNames.supervisor], /EnvironmentFile=\/home\/kendall\/\.config\/kendall\/lan-auth\.env/);
  assert.match(units[unitNames.supervisor], /ExecStart=\/usr\/bin\/uv run --directory services\/supervisor supervisor/);
  assert.match(units[unitNames.dashboard], /Requires=kendall-lan-auth-supervisor\.service/);
  assert.match(units[unitNames.dashboard], /BindsTo=kendall-lan-auth-supervisor\.service/);
  assert.match(units[unitNames.dashboard], /Environment=PATH=/);
  assert.match(units[unitNames.target], /^# Managed by Kendall_Nxt LAN-auth systemd integration v1/m);
  assert.match(units[unitNames.dashboard], /ExecStart=\/usr\/bin\/pnpm run dev:dashboard/);
  assert.doesNotMatch(Object.values(units).join("\n"), /bootstrap-password.*=/);
});

test("tolerates an installed but inactive legacy cockpit target", () => {
  const calls = [];
  const active = legacyWasActive({
    systemctl(args, options) {
      calls.push({ args, options });
      return { status: 3, stdout: "inactive\n", stderr: "" };
    },
  });
  assert.equal(active, false);
  assert.deepEqual(calls, [
    {
      args: ["is-active", "kendall-cockpit.target"],
      options: { allowNotLoaded: true, allowInactive: true },
    },
  ]);
});

test("stops and disables every legacy cockpit unit before LAN-auth startup", () => {
  const calls = [];
  stopLegacyCockpit({
    systemctl(args, options) {
      calls.push({ args, options });
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  assert.deepEqual(calls, [
    { args: ["stop", "kendall-cockpit-supervisor.service"], options: { allowNotLoaded: true } },
    { args: ["stop", "kendall-cockpit-dashboard.service"], options: { allowNotLoaded: true } },
    { args: ["stop", "kendall-cockpit.target"], options: { allowNotLoaded: true } },
    { args: ["disable", "kendall-cockpit.target"], options: { allowNotLoaded: true } },
  ]);
});

test("records whether the legacy target was enabled for rollback", () => {
  const enabled = legacyWasEnabled({
    systemctl(args, options) {
      assert.deepEqual(args, ["is-enabled", "kendall-cockpit.target"]);
      assert.deepEqual(options, { allowNotLoaded: true, allowDisabled: true });
      return { status: 0, stdout: "enabled\n", stderr: "" };
    },
  });
  assert.equal(enabled, true);
});

test("rejects non-canonical ports and unsafe unit paths", () => {
  assert.throws(() => resolveLanAuthConfig({ repoRoot: "/repo", authDir: "/auth", lanAddress: "192.168.1.8", dashboardPort: "03000", validateFiles: false }), /valid TCP port/);
  assert.throws(() => resolveLanAuthConfig({ repoRoot: "/repo with space", authDir: "/auth", lanAddress: "192.168.1.8", validateFiles: false }), /unsafe/);
  assert.throws(() => resolveLanAuthConfig({ repoRoot: "/repo", authDir: "/auth", systemdEnvFile: "/auth/dashboard.key", lanAddress: "192.168.1.8", validateFiles: false }), /must not overlap/);
  assert.throws(() => resolveLanAuthConfig({ repoRoot: "/repo", authDir: "/auth", systemdEnvFile: "/auth/../auth/dashboard.key", lanAddress: "192.168.1.8", validateFiles: false }), /must not overlap/);
  assert.equal(resolveLanAuthConfig({ repoRoot: "/repo", authDir: "/auth", lanAddress: "192.168.1.8", dashboardPort: "443", validateFiles: false }).dashboardOrigin, "https://192.168.1.8");
});

test("accepts a numeric non-mapped dotted IPv6 tail", () => {
  const config = resolveLanAuthConfig({ repoRoot: "/repo", authDir: "/auth", lanAddress: "2001:db8::192.0.2.1", validateFiles: false });
  assert.equal(config.urlHost, "[2001:db8::c000:201]");
  assert.equal(resolveLanAuthConfig({ repoRoot: "/repo", authDir: "/auth", lanAddress: "2001:DB8::8", validateFiles: false }).urlHost, "[2001:db8::8]");
});

test("renders an environment file with paths and no password contents", () => {
  const config = resolveLanAuthConfig({ repoRoot: "/repo", authDir: "/home/operator/kendall-lan-auth", lanAddress: "2001:db8::8", validateFiles: false });
  const env = renderLanAuthEnvironment(config);
  assert.match(env, /KENDALL_LAN_AUTH_ENABLED=true/);
  assert.match(env, /KENDALL_DASHBOARD_ORIGIN="https:\/\/\[2001:db8::8\]:3000"/);
  assert.match(env, /KENDALL_SUPERVISOR_UDS_PATH=.*supervisor\.sock/);
  assert.doesNotMatch(env, /metadata-only-test-fixture/);
});

test("rejects unsafe private auth material", async () => {
  const { root, authDir } = await fixture();
  try {
    await chmod(join(authDir, "dashboard.key"), 0o644);
    assert.throws(() => resolveLanAuthConfig({ repoRoot: root, authDir, lanAddress: "192.168.1.8" }), /owned.*group\/world|accessible/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a group-writable ancestor even when the auth directory is private", async () => {
  const root = await mkdtemp(join(tmpdir(), "knx-lan-auth-parent-"));
  const authDir = join(root, "auth");
  await mkdir(authDir, { mode: 0o700 });
  for (const name of ["bootstrap-password", "dashboard.crt", "dashboard.key"]) {
    await writeFile(join(authDir, name), "fixture\n", { mode: 0o600 });
  }
  try {
    await chmod(root, 0o770);
    assert.throws(() => resolveLanAuthConfig({ repoRoot: root, authDir, lanAddress: "192.168.1.8" }), /parent directory is unsafe/);
  } finally {
    await chmod(root, 0o700);
    await rm(root, { recursive: true, force: true });
  }
});
