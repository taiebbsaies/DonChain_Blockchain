import type { NextConfig } from "next";

/**
 * Développement : autorise l'accès au serveur de dev depuis le réseau local (ex. http://192.168.1.15:3000
 * pour tester sur un téléphone). Sans cela, Next.js bloque le rechargement à chaud (/_next/hmr) et signale
 * une erreur dans l'overlay. Ajoutez d'autres hôtes via NEXT_DEV_ORIGINS="hote1,hote2".
 */
const devOrigins = [
  "127.0.0.1",
  "192.168.*.*",
  "10.*.*.*",
  ...(process.env.NEXT_DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
];

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
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
