import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le paquet partagé est publié en TypeScript source
  transpilePackages: ["@donchain/shared"],
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
