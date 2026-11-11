"use client";

import type { ReactNode } from "react";
import type { Address } from "viem";
import { useWalletReady } from "@/components/campaign/useWalletReady";
import { Notice } from "@/components/Notice";
import { useRoles, type Roles } from "@/lib/roles";

const ROLE_NAMES: Record<keyof Roles, string> = {
  org: "organisation",
  supplier: "prestataire",
  auditor: "auditeur",
  pauser: "pauseur",
};

/**
 * Affiche le contenu uniquement si le portefeuille est connecté, sur le bon réseau, et attesté pour le rôle.
 * Le contrat vérifie de toute façon chaque action : ce garde-fou n'est qu'un confort d'interface.
 */
export function RoleGate({ role, children }: { role: keyof Roles; children: (account: Address) => ReactNode }) {
  const { address, ready } = useWalletReady();
  const { data: roles, isLoading } = useRoles(address);

  if (!address) return <Notice>Connectez votre portefeuille pour accéder à cet espace.</Notice>;
  if (!ready) return <Notice tone="warning">Passez sur le bon réseau depuis le bouton en haut de page.</Notice>;
  if (isLoading || !roles) return <p className="text-ink-muted">Vérification de votre attestation…</p>;
  if (!roles[role]) {
    return (
      <Notice tone="warning">
        Cette adresse n&apos;est pas attestée comme {ROLE_NAMES[role]}. L&apos;attestation (KYC) est accordée par
        l&apos;administrateur de la plateforme.
      </Notice>
    );
  }
  return <>{children(address)}</>;
}
