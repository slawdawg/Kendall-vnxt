import "server-only";
import { Shell, type ShellProps } from "./shell";

export function ServerShell(props: Omit<ShellProps, "lanAuthEnabled">) {
  return <Shell {...props} lanAuthEnabled={process.env.KENDALL_LAN_AUTH_ENABLED === "true"} />;
}
