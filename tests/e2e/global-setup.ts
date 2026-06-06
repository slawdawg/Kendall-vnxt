import fs from "node:fs/promises";
import path from "node:path";

async function globalSetup() {
  const dbPath = path.join(process.cwd(), ".data", "e2e-supervisor.db");
  await fs.rm(dbPath, { force: true });
}

export default globalSetup;
