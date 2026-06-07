import fs from "node:fs/promises";
import path from "node:path";

async function removeIfPresent(filePath: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.rm(filePath, { force: true });
      return;
    } catch (error) {
      const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code !== "EBUSY" || attempt === 4) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

async function globalSetup() {
  const dbPaths = [
    path.join(process.cwd(), ".data", "e2e-supervisor.db"),
    path.join(process.cwd(), "services", "supervisor", ".data", "e2e-supervisor.db"),
  ].filter((dbPath): dbPath is string => Boolean(dbPath));
  await Promise.all(dbPaths.flatMap((dbPath) => [dbPath, `${dbPath}-shm`, `${dbPath}-wal`].map(removeIfPresent)));
}

export default globalSetup;
