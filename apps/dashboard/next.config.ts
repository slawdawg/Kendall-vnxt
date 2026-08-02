import type { NextConfig } from "next";
import { isIP } from "node:net";

const allowedDevOrigins = ["localhost", "127.0.0.1"];
const configuredLanBind = process.env.KENDALL_LAN_AUTH_ENABLED === "true"
  ? process.env.KENDALL_DASHBOARD_BIND_ADDRESS
  : undefined;
const configuredCanonicalHostname = process.env.KENDALL_LAN_AUTH_ENABLED === "true"
  ? process.env.KENDALL_TAILNET_DASHBOARD_CANONICAL_HOSTNAME
  : undefined;

if (configuredLanBind && isIP(configuredLanBind) !== 0) {
  allowedDevOrigins.push(configuredLanBind);
}

function normalizedHostname(value: string | undefined): string | null {
  if (typeof value !== "string" || !value || /[\s/:?#@\\]/.test(value) || isIP(value) !== 0) return null;
  const hostname = value.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname.length > 253 || !hostname.endsWith(".ts.net") || !hostname.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return null;
  return hostname;
}

const canonicalHostname = normalizedHostname(configuredCanonicalHostname);
if (canonicalHostname) {
  allowedDevOrigins.push(canonicalHostname);
}

const nextConfig: NextConfig = {
  allowedDevOrigins,
  devIndicators: false,
  transpilePackages: ["@kendall/contracts", "@kendall/workflow-core"],
};

export default nextConfig;
