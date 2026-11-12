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
  arbiter: "arbitre",
};

/**
 * Affiche le contenu uniquement si le portefeuille est connecté, sur le bon réseau, et attesté pour le rôle.
 * Le contrat vérifie de toute façon chaque action : ce garde-fou n'est qu'un confort d'interface.
 */
export function RoleGate({
  role,
  children,
}: {
  /** Un rôle, ou plusieurs (il suffit d'en détenir un). */
  role: keyof Roles | (keyof Roles)[];
  children: (account: Address) => ReactNode;
}) {
  const wanted = Array.isArray(role) ? role : [role];
  const { address, ready } = useWalletReady();
  const { data: roles, isLoading } = useRoles(address);

  if (!address) return <Notice>Connectez votre portefeuille pour accéder à cet espace.</Notice>;
  if (!ready) return <Notice tone="warning">Passez sur le bon réseau depuis le bouton en haut de page.</Notice>;
  if (isLoading || !roles) return <p className="text-ink-muted">Vérification de votre attestation…</p>;
  if (!wanted.some((r) => roles[r])) {
    return (
      <Notice tone="warning">
        Cette adresse n&apos;est pas attestée comme {wanted.map((r) => ROLE_NAMES[r]).join(" ou ")}. L&apos;attestation (KYC) est accordée par
        l&apos;administrateur de la plateforme.
      </Notice>
    );
  }
  return <>{children(address)}</>;
}
