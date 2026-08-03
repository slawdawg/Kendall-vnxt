import { ControlsPageContent } from "../../components/controls-page-content";
import { LanControlsPage } from "../../components/lan-controls-page";
import { loadControlsPageData } from "../../lib/controls-page-data";

// Controls reads live supervisor state in local mode and the authenticated UDS
// boundary in LAN mode; neither path is a static build artifact.
export const dynamic = "force-dynamic";

export default async function ControlsPage() {
  if (process.env.KENDALL_LAN_AUTH_ENABLED === "true") {
    return <LanControlsPage />;
  }
  return <ControlsPageContent data={await loadControlsPageData()} lanAuthEnabled={false} />;
}
