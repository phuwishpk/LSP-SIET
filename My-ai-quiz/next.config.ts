import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: '/quiz',
  // Skip the type-check during `next build` (too slow on the production
  // server). Next 16 no longer lints during build, so there is no `eslint` option.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
