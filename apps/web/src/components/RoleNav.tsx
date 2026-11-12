"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { useRoles } from "@/lib/roles";

/** Liens vers les espaces professionnels, affichés seulement pour les rôles détenus. */
export function RoleNav() {
  const { address } = useAccount();
  const { data: roles } = useRoles(address);
  if (!roles) return null;

  return (
    <>
      {roles.org && (
        <Link href="/organisation" className="nav-link">
          Organisation
        </Link>
      )}
      {roles.supplier && (
        <Link href="/prestataire" className="nav-link">
          Prestataire
        </Link>
      )}
      {roles.auditor && (
        <Link href="/auditeur" className="nav-link">
          Audit
        </Link>
      )}
      {(roles.arbiter || roles.auditor) && (
        <Link href="/arbitrage" className="nav-link">
          Arbitrage
        </Link>
      )}
    </>
  );
}
