import { PageIntro } from "../../components/page-intro";
import { ProposedWorkBoard } from "../../components/proposed-work-board";
import { Shell } from "../../components/shell";
import { buildNavStats } from "../../lib/nav-stats";
import { getCandidateWork, getWorkItems } from "../../lib/supervisor";

export default async function ProposedWorkPage() {
  const [candidates, items] = await Promise.all([getCandidateWork(), getWorkItems()]);
  const navStats = buildNavStats(items, candidates.length);
  const proposedCount = candidates.filter((candidate) => candidate.status === "proposed").length;
  const approvedCount = candidates.filter((candidate) => candidate.status === "approved").length;
  const highPriorityCount = candidates.filter((candidate) => ["high", "urgent"].includes(candidate.priority)).length;

  return (
    <Shell navStats={navStats}>
      <PageIntro
        eyebrow="Proposed Work"
        title="Ideas waiting at the front door"
        description="Review plans and requests before they enter active work."
        metrics={[
          { label: "Waiting", value: String(proposedCount) },
          { label: "Approved", value: String(approvedCount) },
          { label: "High priority", value: String(highPriorityCount) },
          { label: "Total", value: String(candidates.length) },
        ]}
      />
      <ProposedWorkBoard candidates={candidates} />
    </Shell>
  );
}
