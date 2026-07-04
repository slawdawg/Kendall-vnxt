import { readFile } from "node:fs/promises";
import { join } from "node:path";

const fixtureRoot = join(process.cwd(), "tests/fixtures/manager-control-plane");

export async function loadManagerFixture(relativePath) {
  return JSON.parse(await readFile(join(fixtureRoot, relativePath), "utf8"));
}
