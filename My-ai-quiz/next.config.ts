import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: '/quiz',
  // Skip the type-check during `next build` (too slow on the production
  // server). Next 16 no longer lints during build, so there is no `eslint` option.
  typescript: { ignoreBuildErrors: true },
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
