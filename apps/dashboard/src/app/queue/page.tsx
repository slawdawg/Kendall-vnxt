import { Shell } from "../../components/shell";
import { WorkGrid } from "../../components/work-grid";
import { getWorkItems } from "../../lib/supervisor";

export default async function QueuePage() {
  const items = await getWorkItems();
  return (
    <Shell>
      <WorkGrid items={items} />
    </Shell>
  );
}
