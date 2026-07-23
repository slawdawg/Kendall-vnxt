import type { NextConfig } from "next";
import { isIP } from "node:net";

const allowedDevOrigins = ["localhost", "127.0.0.1"];
const configuredLanBind = process.env.KENDALL_LAN_AUTH_ENABLED === "true"
  ? process.env.KENDALL_DASHBOARD_BIND_ADDRESS
  : undefined;

if (configuredLanBind && isIP(configuredLanBind) !== 0) {
  allowedDevOrigins.push(configuredLanBind);
}

const nextConfig: NextConfig = {
  allowedDevOrigins,
  devIndicators: false,
  transpilePackages: ["@kendall/contracts", "@kendall/workflow-core"],
};

export default nextConfig;
