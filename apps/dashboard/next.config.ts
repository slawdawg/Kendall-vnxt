import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.1.8"],
  devIndicators: false,
  transpilePackages: ["@kendall/contracts", "@kendall/workflow-core"],
};

export default nextConfig;
