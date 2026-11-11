"use client";

import { useState } from "react";
import Link from "next/link";
import type { Address } from "viem";
import { useWriteContract } from "wagmi";
import { milestoneTrackerAbi } from "@donchain/shared";
import type { CampaignDetail, Milestone } from "@/lib/chain-data";
import { TARGET_CHAIN_ID } from "@/lib/config";
import { formatDate, formatUsdc } from "@/lib/format";
import { useTransaction } from "@/lib/hooks";
import { AddressText } from "@/components/AddressText";
import { MilestoneStatusBadge } from "@/components/Badges";
import { Notice } from "@/components/Notice";
import { ProofList } from "@/components/ProofList";

export function AuditMilestone({ m, detail, account }: { m: Milestone; detail: CampaignDetail; account: Address }) {
  const { writeContractAsync } = useWriteContract();
  const tx = useTransaction();
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const tracker = detail.summary.tracker;
  const me = account.toLowerCase();
  const conflict = me === detail.summary.org.toLowerCase() || me === m.supplier.toLowerCase();

  async function approve() {
    await tx.run("approve", () =>
      writeContractAsync({
        chainId: TARGET_CHAIN_ID,
        address: tracker,
        abi: milestoneTrackerAbi,
        functionName: "approve",
        args: [m.id],
      }),
    );
  }

  async function reject() {
    if (!reason.trim()) return;
    const ok = await tx.run("reject", () =>
      writeContractAsync({
        chainId: TARGET_CHAIN_ID,
        address: tracker,
        abi: milestoneTrackerAbi,
        functionName: "reject",
        args: [m.id, reason.trim()],
      }),
    );
    if (ok) {
      setReason("");
      setRejecting(false);
    }
  }

  return (
    <li className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-ink-muted">
            <Link href={`/campaigns/${detail.summary.id}`} className="link">
              {detail.summary.metadata?.name ?? `Campagne #${detail.summary.id}`}
            </Link>{" "}
            · Jalon {Number(m.id) + 1}
          </p>
          <p className="font-medium">{m.metadata?.title ?? "Sans intitulé"}</p>
          {m.metadata?.quote && <p className="text-sm text-ink-muted">{m.metadata.quote}</p>}
        </div>
        <MilestoneStatusBadge status={m.status} />
      </div>

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-ink-muted">Montant</dt>
          <dd className="font-medium">{formatUsdc(m.amount)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Organisation</dt>
          <dd>
            <AddressText address={detail.summary.org} />
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Prestataire</dt>
          <dd>
            <AddressText address={m.supplier} />
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Date limite</dt>
          <dd>{formatDate(m.deadline)}</dd>
        </div>
      </dl>

      <ProofList proofs={m.proofs} />

      <p className={`text-sm ${m.supplierConfirmed ? "text-success" : "text-ink-muted"}`}>
        {m.supplierConfirmed
          ? "✓ Le prestataire a signé l'accusé de réception pour la dernière preuve."
          : "○ Le prestataire n'a pas encore signé l'accusé de réception. L'approbation est bloquée en attendant."}
      </p>

      {conflict && (
        <Notice tone="warning">
          Vous êtes l&apos;organisation ou le prestataire de ce jalon : la séparation des pouvoirs vous interdit de
          l&apos;auditer.
        </Notice>
      )}

      {m.status === "Submitted" && !conflict && (
        <div className="space-y-3 border-t border-line pt-4">
          <p className="text-xs text-ink-muted">
            Vérifiez que la preuve correspond au devis, au montant et au prestataire. Après approbation, une fenêtre de
            contestation s&apos;ouvre avant le paiement.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={!m.supplierConfirmed || !!tx.pending}
              onClick={approve}
            >
              {tx.pending === "approve" ? "Approbation…" : "Approuver"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={!!tx.pending}
              onClick={() => setRejecting((r) => !r)}
              aria-expanded={rejecting}
            >
              Rejeter…
            </button>
          </div>
          {rejecting && (
            <div className="space-y-2">
              <label htmlFor={`reason-${tracker}-${m.id}`} className="block text-sm font-medium">
                Motif du rejet (public, définitif)
              </label>
              <textarea
                id={`reason-${tracker}-${m.id}`}
                className="input min-h-16"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
              />
              <button
                type="button"
                className="btn-warning"
                disabled={!reason.trim() || !!tx.pending}
                onClick={reject}
              >
                {tx.pending === "reject" ? "Rejet…" : "Confirmer le rejet"}
              </button>
            </div>
          )}
        </div>
      )}

      {tx.error && <Notice tone="danger">{tx.error}</Notice>}
    </li>
  );
}
