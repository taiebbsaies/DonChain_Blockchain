"use client";

import { useAccount } from "wagmi";
import { TARGET_CHAIN_ID } from "@/lib/config";

/** Portefeuille connecté ET sur le bon réseau : condition pour signer une transaction. */
export function useWalletReady() {
  const { address, chainId, isConnected } = useAccount();
  return { address, ready: isConnected && !!address && chainId === TARGET_CHAIN_ID };
}
