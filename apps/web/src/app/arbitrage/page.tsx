"use client";

import { RoleGate } from "@/components/pro/RoleGate";
import { ResolveDispute } from "@/components/pro/ArbiterPanels";
import { Notice } from "@/components/Notice";
import { useAllCampaignDetails } from "@/lib/hooks";

export default function ArbitragePage() {
  const { data: details, isLoading, error } = useAllCampaignDetails();
  const queue =
    details?.flatMap((d) => d.milestones.filter((m) => m.status === "Disputed").map((m) => ({ d, m }))) ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Arbitrage des contestations</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Jalons approuvés puis contestés par un donateur pendant la fenêtre de contestation. La décision revient à un
          arbitre ou à un auditeur indépendant : ni l&apos;organisation, ni le prestataire, ni les auditeurs ayant
          approuvé, ni le donateur contestataire.
        </p>
      </header>

      <RoleGate role={["arbiter", "auditor"]}>
        {(account) => (
          <div className="space-y-3">
            {error && <Notice tone="danger">Lecture impossible : {error.message}</Notice>}
            {isLoading && <p className="text-ink-muted">Chargement…</p>}
            {details && queue.length === 0 && <p className="text-ink-muted">Aucune contestation en cours.</p>}
            <ul className="space-y-3">
              {queue.map(({ d, m }) => (
                <ResolveDispute key={`${d.summary.tracker}-${m.id}`} m={m} detail={d} account={account} />
              ))}
            </ul>
          </div>
        )}
      </RoleGate>
    </div>
  );
}
