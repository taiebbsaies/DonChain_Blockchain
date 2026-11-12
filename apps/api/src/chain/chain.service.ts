import { Inject, Injectable } from '@nestjs/common';
import { createPublicClient, http, keccak256, toBytes, type Address, type PublicClient } from 'viem';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { attestationRegistryAbi } from '../generated/contracts.js';

export const ROLES = ['org', 'supplier', 'auditor', 'arbiter', 'pauser'] as const;
export type Role = (typeof ROLES)[number];

const ROLE_IDS: Record<Role, `0x${string}`> = {
  org: keccak256(toBytes('ORG_ROLE')),
  supplier: keccak256(toBytes('SUPPLIER_ROLE')),
  auditor: keccak256(toBytes('AUDITOR_ROLE')),
  arbiter: keccak256(toBytes('ARBITER_ROLE')),
  pauser: keccak256(toBytes('PAUSER_ROLE')),
};

/** Accès en lecture à la blockchain, source de vérité (§11). */
@Injectable()
export class ChainService {
  readonly client: PublicClient;
  private readonly roleCache = new Map<string, { value: Role[]; at: number }>();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.client = createPublicClient({ transport: http(config.rpcUrl) }) as PublicClient;
  }

  /** Rôles attestés (KYC) de l'adresse, mis en cache 30 s pour limiter les appels RPC. */
  async rolesOf(address: Address): Promise<Role[]> {
    const key = address.toLowerCase();
    const cached = this.roleCache.get(key);
    if (cached && Date.now() - cached.at < 30_000) return cached.value;
    const flags = await Promise.all(
      ROLES.map((r) =>
        this.client.readContract({
          address: this.config.deployment.registry,
          abi: attestationRegistryAbi,
          functionName: 'hasRole',
          args: [ROLE_IDS[r], address],
        }),
      ),
    );
    const value = ROLES.filter((_, i) => flags[i]);
    this.roleCache.set(key, { value, at: Date.now() });
    return value;
  }
}
