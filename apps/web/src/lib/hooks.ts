"use client";

import { useState } from "react";
import type { Address, Hash, PublicClient } from "viem";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { TARGET_CHAIN_ID, deployment } from "./config";
import {
  fetchAllCampaignDetails,
  fetchCampaignDetail,
  fetchCampaigns,
  fetchDonorPosition,
  fetchReceipts,
} from "./chain-data";
import { errorMessage } from "./format";

function useClient(): PublicClient | undefined {
  return usePublicClient({ chainId: TARGET_CHAIN_ID }) as PublicClient | undefined;
}

export function useCampaigns() {
  const client = useClient();
  return useQuery({
    queryKey: ["campaigns", TARGET_CHAIN_ID],
    queryFn: () => fetchCampaigns(client!, deployment!),
    enabled: !!client && !!deployment,
  });
}

export function useCampaign(id: bigint | null) {
  const client = useClient();
  return useQuery({
    queryKey: ["campaign", TARGET_CHAIN_ID, id?.toString()],
    queryFn: () => fetchCampaignDetail(client!, deployment!, id!),
    enabled: !!client && !!deployment && id !== null,
  });
}

/** Toutes les campagnes avec leurs jalons (espaces organisation, prestataire, auditeur). */
export function useAllCampaignDetails() {
  const client = useClient();
  return useQuery({
    queryKey: ["campaign-details", TARGET_CHAIN_ID],
    queryFn: () => fetchAllCampaignDetails(client!, deployment!),
    enabled: !!client && !!deployment,
  });
}

export function useDonorPosition(vault: Address | undefined, donor: Address | undefined) {
  const client = useClient();
  return useQuery({
    queryKey: ["position", TARGET_CHAIN_ID, vault, donor],
    queryFn: () => fetchDonorPosition(client!, deployment!, vault!, donor!),
    enabled: !!client && !!deployment && !!vault && !!donor,
  });
}

export function useReceipts(owner: Address | undefined) {
  const client = useClient();
  return useQuery({
    queryKey: ["receipts", TARGET_CHAIN_ID, owner],
    queryFn: () => fetchReceipts(client!, deployment!, owner!),
    enabled: !!client && !!deployment && !!owner,
  });
}

/**
 * Exécute une transaction, attend sa confirmation puis rafraîchit toutes les lectures.
 * `pending` contient le libellé de l'action en cours ; `error` le dernier message d'erreur.
 */
export function useTransaction() {
  const client = useClient();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(label: string, send: () => Promise<Hash>): Promise<boolean> {
    setPending(label);
    setError(null);
    try {
      const hash = await send();
      const receipt = await client!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("La transaction a échoué on-chain.");
      await queryClient.invalidateQueries();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setPending(null);
    }
  }

  return { run, pending, error, clearError: () => setError(null) };
}
