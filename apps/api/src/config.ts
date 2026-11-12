import { deployments, type Deployment } from './generated/contracts.js';

/** Configuration de l'API, lue depuis l'environnement (voir apps/api/.env.example). */
export type AppConfig = {
  port: number;
  production: boolean;
  databaseUrl: string;
  chainId: number;
  rpcUrl: string;
  deployment: Deployment;
  /** Origines autorisées (CORS) et domaines acceptés dans les messages SIWE. */
  corsOrigins: string[];
  siweDomains: string[];
  jwtSecret: string;
  /** Durée de vie des jetons d'accès, en secondes (courte par conception, §11). */
  jwtTtl: number;
  uploadMaxBytes: number;
  pinataJwt: string | null;
  /** Service d'épinglage secondaire (IPFS Pinning Service API), ex. https://api.filebase.io/v1/ipfs */
  secondaryPinUrl: string | null;
  secondaryPinToken: string | null;
  publicGateway: string;
  indexerEnabled: boolean;
  indexerPollMs: number;
  confirmations: number;
  indexerChunk: number;
};

export const APP_CONFIG = Symbol('APP_CONFIG');

function list(value: string | undefined, fallback: string[]): string[] {
  const items = value
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return items && items.length > 0 ? items : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const production = env.NODE_ENV === 'production';
  const chainId = Number(env.CHAIN_ID ?? 31337);
  const deployment = deployments[chainId];
  if (!deployment) {
    throw new Error(
      `Aucun déploiement connu pour la chaîne ${chainId}. Lancez le déploiement puis "pnpm --filter @donchain/shared generate".`,
    );
  }
  const jwtSecret = env.JWT_SECRET ?? '';
  if (production && jwtSecret.length < 32) {
    throw new Error('JWT_SECRET doit faire au moins 32 caractères en production.');
  }
  const corsOrigins = list(env.CORS_ORIGINS, ['http://localhost:3000', 'http://127.0.0.1:3000']);

  return {
    port: Number(env.PORT ?? 4000),
    production,
    databaseUrl: env.DATABASE_URL ?? 'postgres://donchain:donchain@127.0.0.1:5432/donchain',
    chainId,
    rpcUrl: env.RPC_URL ?? 'http://127.0.0.1:8545',
    deployment,
    corsOrigins,
    siweDomains: list(
      env.SIWE_DOMAINS,
      corsOrigins.map((o) => new URL(o).host),
    ),
    jwtSecret: jwtSecret || 'dev-only-insecure-secret-change-me-please',
    jwtTtl: Number(env.JWT_TTL_SECONDS ?? 900),
    uploadMaxBytes: Number(env.UPLOAD_MAX_BYTES ?? 10 * 1024 * 1024),
    pinataJwt: env.PINATA_JWT || null,
    secondaryPinUrl: env.SECONDARY_PIN_URL || null,
    secondaryPinToken: env.SECONDARY_PIN_TOKEN || null,
    publicGateway: (env.PUBLIC_IPFS_GATEWAY ?? `http://localhost:${env.PORT ?? 4000}`).replace(/\/$/, ''),
    indexerEnabled: env.INDEXER_ENABLED !== 'false',
    indexerPollMs: Number(env.INDEXER_POLL_MS ?? 4000),
    confirmations: Number(env.CONFIRMATIONS ?? (chainId === 31337 ? 0 : 3)),
    indexerChunk: Number(env.INDEXER_CHUNK ?? 2000),
  };
}
