import { createConfig, http, type CreateConnectorFn } from "wagmi";
import { baseSepolia, foundry } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

/** Identifiant de projet Reown (WalletConnect) : https://cloud.reown.com. Sans lui, pas de portefeuille mobile. */
export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

const connectors: CreateConnectorFn[] = [injected()];
if (WALLETCONNECT_PROJECT_ID) {
  connectors.push(
    walletConnect({
      projectId: WALLETCONNECT_PROJECT_ID,
      showQrModal: true,
      metadata: {
        name: "DonChain",
        description: "Dons traçables sur la blockchain",
        url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        icons: [],
      },
    }),
  );
}

export const wagmiConfig = createConfig({
  chains: [foundry, baseSepolia],
  connectors,
  transports: {
    [foundry.id]: http(process.env.NEXT_PUBLIC_LOCAL_RPC_URL ?? "http://127.0.0.1:8545"),
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
