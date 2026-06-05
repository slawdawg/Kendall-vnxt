import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@kendall/contracts", "@kendall/workflow-core"],
};

export default nextConfig;
