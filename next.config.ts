import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Isolate the guarded review server from any existing Next dev process.
  distDir: process.env.FITPASS_DEMO_LOCAL_ONLY === "1" ? ".next-fitpass-local-review" : ".next",
  ...(process.env.FITPASS_DEMO_LOCAL_ONLY === "1"
    ? { typescript: { tsconfigPath: "tsconfig.fitpass-review.json" } }
    : {}),
  cacheComponents: true,
  partialPrefetching: true,
  // Next 16 otherwise appends its own block to AGENTS.md on every `next dev`.
  agentRules: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
