"use client";

import { useState } from "react";
import Link from "next/link";
import type { Address } from "viem";
import { useWriteContract } from "wagmi";
import { milestoneTrackerAbi } from "@donchain/shared";
import type { CampaignDetail, Milestone } from "@/lib/chain-data";
import { TARGET_CHAIN_ID } from "@/lib/config";
import { formatDateTime, formatUsdc } from "@/lib/format";
import { useTransaction } from "@/lib/hooks";
import { AddressText } from "@/components/AddressText";
import { MilestoneStatusBadge } from "@/components/Badges";
import { Notice } from "@/components/Notice";
import { ProofList } from "@/components/ProofList";

/** Décision sur une contestation de donateur (Phase 2, §5.5). */
export function ResolveDispute({ m, detail, account }: { m: Milestone; detail: CampaignDetail; account: Address }) {
  const { writeContractAsync } = useWriteContract();
  const tx = useTransaction();
  const [note, setNote] = useState("");
  const d = m.dispute!;
  const me = account.toLowerCase();
  const conflicted = [detail.summary.org, m.supplier, m.approvedBy, m.firstApprover, d.disputer].some(
    (a) => a.toLowerCase() === me,
  );

  async function resolve(upheld: boolean) {
    await tx.run(upheld ? "uphold" : "dismiss", () =>
      writeContractAsync({
        chainId: TARGET_CHAIN_ID,
        address: detail.summary.tracker,
        abi: milestoneTrackerAbi,
        functionName: "resolveDispute",
        args: [m.id, upheld, note.trim()],
      }),
    );
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
        </div>
        <MilestoneStatusBadge status={m.status} />
      </div>

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-ink-muted">Montant</dt>
          <dd className="font-medium">{formatUsdc(m.amount)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Prestataire</dt>
          <dd>
            <AddressText address={m.supplier} />
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Approuvé par</dt>
          <dd>
            <AddressText address={m.approvedBy} />
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Contesté par</dt>
          <dd>
            <AddressText address={d.disputer} />
            <span className="block text-xs text-ink-muted">le {formatDateTime(d.openedAt)}</span>
          </dd>
        </div>
      </dl>
      <p className="text-xs text-ink-muted">
        Le motif du donateur est public dans l&apos;événement <code>DisputeOpened</code> de la transaction.
        {d.deposit > 0n && <> Caution déposée : {formatUsdc(d.deposit)}.</>}
      </p>

      <ProofList proofs={m.proofs} />

      {conflicted ? (
        <Notice tone="warning">
          Vous êtes partie prenante de ce jalon (organisation, prestataire, auditeur ayant approuvé ou donateur
          contestataire) : vous ne pouvez pas trancher.
        </Notice>
      ) : (
        <div className="space-y-3 border-t border-line pt-4">
          <label htmlFor={`note-${detail.summary.tracker}-${m.id}`} className="block text-sm font-medium">
            Motivation de la décision (publique)
          </label>
          <textarea
            id={`note-${detail.summary.tracker}-${m.id}`}
            className="input min-h-16"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-warning"
              disabled={!note.trim() || !!tx.pending}
              onClick={() => resolve(true)}
            >
              {tx.pending === "uphold" ? "Envoi…" : "Retenir : rejeter le jalon"}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!note.trim() || !!tx.pending}
              onClick={() => resolve(false)}
            >
              {tx.pending === "dismiss" ? "Envoi…" : "Rejeter la contestation : autoriser le paiement"}
            </button>
          </div>
          <p className="text-xs text-ink-muted">
            Retenue : les fonds réservés redeviennent disponibles et la caution est rendue. Rejetée : le paiement
            redevient possible après la fenêtre initiale et la caution est versée au prestataire.
          </p>
        </div>
      )}

      {tx.error && <Notice tone="danger">{tx.error}</Notice>}
    </li>
  );
}
