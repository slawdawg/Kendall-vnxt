import { runSyntheticValidation } from "./lib/knx-obsidian-memory.mjs";

const result = runSyntheticValidation();
process.stdout.write(`${JSON.stringify({
  status: result.status,
  work_dir: result.work_dir,
  approved_notes: result.approved_notes,
  proposal_id: result.proposal.id,
  draft: result.draft.relative_path,
  findings: result.findings,
}, null, 2)}\n`);

if (result.status !== "PASS") {
  process.exit(1);
}

