import { ControlsPageContent } from "../../components/controls-page-content";
import { LanControlsPage } from "../../components/lan-controls-page";
import { loadControlsPageData } from "../../lib/controls-page-data";

export default async function ControlsPage() {
  if (process.env.KENDALL_LAN_AUTH_ENABLED === "true") {
    return <LanControlsPage />;
  }
  return <ControlsPageContent data={await loadControlsPageData()} lanAuthEnabled={false} />;
}
