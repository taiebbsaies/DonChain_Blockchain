"use client";

import { RoleGate } from "@/components/pro/RoleGate";
import { AuditMilestone } from "@/components/pro/AuditorPanels";
import { Notice } from "@/components/Notice";
import { useAllCampaignDetails } from "@/lib/hooks";

export default function AuditorPage() {
  const { data: details, isLoading, error } = useAllCampaignDetails();
  const queue =
    details?.flatMap((d) => d.milestones.filter((m) => m.status === "Submitted").map((m) => ({ d, m }))) ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Espace auditeur</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Jalons dont la preuve a été soumise. Un jalon ne peut être approuvé qu&apos;après la signature du prestataire,
          et jamais par l&apos;organisation ou le prestataire lui-même.
        </p>
      </header>

      <RoleGate role="auditor">
        {(account) => (
          <div className="space-y-3">
            {error && <Notice tone="danger">Lecture impossible : {error.message}</Notice>}
            {isLoading && <p className="text-ink-muted">Chargement…</p>}
            {details && queue.length === 0 && <p className="text-ink-muted">Aucun jalon en attente d&apos;audit.</p>}
            <ul className="space-y-3">
              {queue.map(({ d, m }) => (
                <AuditMilestone key={`${d.summary.tracker}-${m.id}`} m={m} detail={d} account={account} />
              ))}
            </ul>
          </div>
        )}
      </RoleGate>
    </div>
  );
}
