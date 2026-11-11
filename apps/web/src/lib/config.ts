import { deployments, type Deployment } from "@donchain/shared";
import { baseSepolia, foundry } from "wagmi/chains";

/** Réseau ciblé par l'application (31337 = anvil local, 84532 = Base Sepolia). */
const requestedChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? foundry.id);
export const targetChain = requestedChainId === baseSepolia.id ? baseSepolia : foundry;
export const TARGET_CHAIN_ID: typeof foundry.id | typeof baseSepolia.id = targetChain.id;
export const isLocalChain = targetChain.id === foundry.id;

/** Adresses des contrats pour le réseau ciblé (générées par @donchain/shared). */
export const deployment: Deployment | undefined = deployments[TARGET_CHAIN_ID];

export const IPFS_GATEWAY = (process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "https://ipfs.io").replace(/\/$/, "");
