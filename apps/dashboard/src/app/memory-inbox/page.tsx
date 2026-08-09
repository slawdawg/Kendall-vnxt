import { ServerShell as Shell } from "../../components/server-shell";
import { MemoryInboxShell } from "../../components/memory-inbox-shell";

export const dynamic = "force-dynamic";

export default function MemoryInboxPage() {
  return (
    <Shell compactHeader realtimeRefresh={false} wide>
      <MemoryInboxShell />
    </Shell>
  );
}
