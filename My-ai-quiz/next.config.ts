import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: '/quiz',
  outputFileTracingRoot: path.join(__dirname, "../"),
  experimental: {
    externalDir: true,
  },
  webpack: (config) => {
    config.resolve.modules = [
      path.resolve(__dirname, "node_modules"),
      ...(config.resolve.modules || ["node_modules"]),
    ];
    return config;
  },
};

export default nextConfig;
