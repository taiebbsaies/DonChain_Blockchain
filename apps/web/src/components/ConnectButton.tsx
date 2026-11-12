"use client";

import { useSyncExternalStore } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { TARGET_CHAIN_ID, targetChain } from "@/lib/config";
import { errorMessage, shortAddress } from "@/lib/format";

/** Vrai si un portefeuille d'extension (MetaMask, Rabby…) est injecté dans la page. */
function useHasInjectedWallet(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => typeof window !== "undefined" && "ethereum" in window && !!(window as { ethereum?: unknown }).ethereum,
    () => true, // côté serveur : on suppose qu'il y en a un pour éviter un faux message au rendu initial
  );
}

/** Les refus explicites de l'utilisateur ne sont pas des erreurs à afficher. */
function isUserRejection(error: unknown): boolean {
  return /reject|denied|annul/i.test(errorMessage(error));
}

export function ConnectButton() {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending, error: connectError, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching, error: switchError } = useSwitchChain();
  const hasWallet = useHasInjectedWallet();

  const error = connectError ?? switchError;
  const errorText = error && !isUserRejection(error) ? errorMessage(error) : null;

  if (!isConnected || !address) {
    if (!hasWallet && !connectors.some((c) => c.type === "walletConnect")) {
      return (
        <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className="btn-secondary">
          Installer un portefeuille
        </a>
      );
    }
    // Connexion d'abord, SANS imposer de réseau : certains portefeuilles (Trust Wallet…) se bloquent
    // quand on leur demande d'ajouter/changer de réseau pendant la connexion. Le changement de réseau
    // est proposé ensuite, comme une étape séparée (bouton « Passer sur … »).
    const available = connectors.filter((c) => c.type !== "injected" || hasWallet);
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex flex-wrap justify-end gap-2">
          {available.map((connector) => (
            <button
              key={connector.uid}
              type="button"
              className={connector.type === "injected" ? "btn-primary" : "btn-secondary"}
              disabled={isPending}
              onClick={() => {
                reset();
                connect({ connector });
              }}
            >
              {isPending
                ? "Connexion… (voir le portefeuille)"
                : connector.type === "walletConnect"
                  ? "Portefeuille mobile"
                  : "Connecter un portefeuille"}
            </button>
          ))}
        </div>
        {errorText && (
          <p role="alert" className="max-w-xs text-right text-xs text-danger">
            {errorText}
          </p>
        )}
      </div>
    );
  }

  if (chainId !== TARGET_CHAIN_ID) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          className="btn-warning"
          disabled={switching}
          onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
        >
          {switching ? "Changement… (voir le portefeuille)" : `Passer sur ${targetChain.name}`}
        </button>
        <button type="button" className="btn-ghost text-xs" onClick={() => disconnect()}>
          Déconnecter
        </button>
        {errorText && (
          <p role="alert" className="max-w-xs text-right text-xs text-danger">
            {errorText}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="rounded-full bg-surface-muted px-3 py-1.5 font-mono text-sm" title={address}>
        {shortAddress(address)}
      </span>
      <button type="button" className="btn-ghost text-sm" onClick={() => disconnect()}>
        Déconnecter
      </button>
    </div>
  );
}
