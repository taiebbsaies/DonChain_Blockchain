"use client";

import { keccak256, toBytes, type Address, type PublicClient } from "viem";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { attestationRegistryAbi } from "@donchain/shared";
import { TARGET_CHAIN_ID, deployment } from "./config";

export const ROLE_IDS = {
  org: keccak256(toBytes("ORG_ROLE")),
  supplier: keccak256(toBytes("SUPPLIER_ROLE")),
  auditor: keccak256(toBytes("AUDITOR_ROLE")),
  pauser: keccak256(toBytes("PAUSER_ROLE")),
} as const;

export type Roles = Record<keyof typeof ROLE_IDS, boolean>;

/** Rôles attestés (KYC) de l'adresse dans l'AttestationRegistry. */
export function useRoles(account: Address | undefined) {
  const client = usePublicClient({ chainId: TARGET_CHAIN_ID }) as PublicClient | undefined;
  return useQuery({
    queryKey: ["roles", TARGET_CHAIN_ID, account],
    enabled: !!client && !!deployment && !!account,
    queryFn: async (): Promise<Roles> => {
      const entries = await Promise.all(
        (Object.keys(ROLE_IDS) as (keyof typeof ROLE_IDS)[]).map(async (key) => {
          const has = await client!.readContract({
            address: deployment!.registry,
            abi: attestationRegistryAbi,
            functionName: "hasRole",
            args: [ROLE_IDS[key], account!],
          });
          return [key, has] as const;
        }),
      );
      return Object.fromEntries(entries) as Roles;
    },
  });
}
