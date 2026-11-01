import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import type { NextConfig } from "next";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: projectRoot,
    resolveAlias: {
      canvas: "./lib/stubs/canvas.js",
    },
  },
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      canvas: "./lib/stubs/canvas.js",
    };
    return config;
  },
};

export default nextConfig;
