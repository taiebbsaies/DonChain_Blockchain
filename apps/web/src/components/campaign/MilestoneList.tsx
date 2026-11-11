"use client";

import { useWriteContract } from "wagmi";
import { milestoneTrackerAbi } from "@donchain/shared";
import type { CampaignDetail, Milestone } from "@/lib/chain-data";
import { TARGET_CHAIN_ID } from "@/lib/config";
import { formatDate, formatDuration, formatUsdc } from "@/lib/format";
import { useTransaction } from "@/lib/hooks";
import { AddressText } from "@/components/AddressText";
import { MilestoneStatusBadge } from "@/components/Badges";
import { Notice } from "@/components/Notice";
import { ProofList } from "@/components/ProofList";
import { useWalletReady } from "./useWalletReady";

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className={`badge ${done ? "tone-success" : "tone-neutral"}`}>
      <span aria-hidden>{done ? "✓" : "○"}</span>
      <span className="ml-1">{children}</span>
      <span className="sr-only">{done ? " : fait" : " : en attente"}</span>
    </li>
  );
}

function MilestoneCard({ m, detail }: { m: Milestone; detail: CampaignDetail }) {
  const { ready } = useWalletReady();
  const { writeContractAsync } = useWriteContract();
  const tx = useTransaction();
  const tracker = detail.summary.tracker;

  const releaseAt = m.approvedAt + detail.challengePeriod;
  const canRelease = m.status === "Approved" && detail.chainNow >= releaseAt && detail.summary.state === "Active";
  const expireAt = m.deadline + detail.gracePeriod;
  const canExpire = (m.status === "Pending" || m.status === "Submitted") && detail.chainNow > expireAt;
  const approvedOrPaid = m.status === "Approved" || m.status === "Released";

  const call = (functionName: "executeRelease" | "expire") =>
    tx.run(functionName, () =>
      writeContractAsync({
        chainId: TARGET_CHAIN_ID,
        address: tracker,
        abi: milestoneTrackerAbi,
        functionName,
        args: [m.id],
      }),
    );

  return (
    <li className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-ink-muted">Jalon {Number(m.id) + 1}</p>
          <h3 className="font-semibold">{m.metadata?.title ?? "Jalon sans description lisible"}</h3>
          {m.metadata?.quote && <p className="text-sm text-ink-muted">{m.metadata.quote}</p>}
        </div>
        <MilestoneStatusBadge status={m.status} />
      </div>

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-ink-muted">Montant figé</dt>
          <dd className="font-medium">{formatUsdc(m.amount)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Prestataire figé</dt>
          <dd>
            <AddressText address={m.supplier} />
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Date limite</dt>
          <dd>{formatDate(m.deadline)}</dd>
        </div>
      </dl>

      {/* Validation multi-acteurs : preuve, prestataire, auditeur (§5.2) */}
      {m.status !== "Draft" && m.status !== "Cancelled" && (
        <ol className="flex flex-wrap gap-2" aria-label="Étapes de validation du jalon">
          <Step done={m.proofs.length > 0}>Preuve soumise</Step>
          <Step done={m.supplierConfirmed || approvedOrPaid}>Livraison confirmée par le prestataire</Step>
          <Step done={m.approvedAt > 0n}>Approuvé par l&apos;auditeur</Step>
        </ol>
      )}

      <ProofList proofs={m.proofs} />

      {m.status === "Approved" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-muted p-3 text-sm">
          {canRelease ? (
            <span>La fenêtre de contestation est close. N&apos;importe qui peut déclencher le paiement.</span>
          ) : (
            <span>Fenêtre de contestation : paiement possible dans {formatDuration(releaseAt - detail.chainNow)}.</span>
          )}
          {canRelease && (
            <button
              type="button"
              className="btn-primary"
              disabled={!ready || !!tx.pending}
              onClick={() => call("executeRelease")}
            >
              {tx.pending ? "Paiement…" : "Payer le prestataire"}
            </button>
          )}
        </div>
      )}

      {canExpire && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger/10 p-3 text-sm">
          <span>Ce jalon a dépassé sa date limite et le délai de grâce. Le déclarer expiré ouvre les remboursements.</span>
          <button
            type="button"
            className="btn-secondary"
            disabled={!ready || !!tx.pending}
            onClick={() => call("expire")}
          >
            {tx.pending ? "Envoi…" : "Déclarer expiré"}
          </button>
        </div>
      )}

      {tx.error && <Notice tone="danger">{tx.error}</Notice>}
    </li>
  );
}

export function MilestoneList({ detail }: { detail: CampaignDetail }) {
  if (detail.milestones.length === 0) {
    return <p className="text-sm text-ink-muted">L&apos;organisation n&apos;a pas encore défini de jalon.</p>;
  }
  return (
    <ol className="space-y-4">
      {detail.milestones.map((m) => (
        <MilestoneCard key={m.id.toString()} m={m} detail={detail} />
      ))}
    </ol>
  );
}
