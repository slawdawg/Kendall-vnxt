import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const dataDir = join(rootDir, ".data");
const uvCacheDir = join(dataDir, "uv-cache");
const tempDir = join(tmpdir(), "kendall-supervisor-tests");

mkdirSync(uvCacheDir, { recursive: true });
mkdirSync(tempDir, { recursive: true });

const windowsUvPath = process.env.USERPROFILE ? join(process.env.USERPROFILE, ".local", "bin", "uv.exe") : "";
const uvCommand = process.env.UV_EXE || (process.platform === "win32" && existsSync(windowsUvPath) ? windowsUvPath : "uv");
const pytestArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const args = ["run", "--directory", "services/supervisor", "pytest", "-p", "no:cacheprovider", ...pytestArgs];

const result = spawnSync(uvCommand, args, {
  cwd: rootDir,
  env: {
    ...process.env,
    UV_CACHE_DIR: uvCacheDir,
    TMP: tempDir,
    TEMP: tempDir,
  },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
