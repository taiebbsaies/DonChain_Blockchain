"use client";

import { useState } from "react";
import { useReadContract, useWriteContract } from "wagmi";
import { erc20Abi, milestoneTrackerAbi } from "@donchain/shared";
import type { CampaignDetail, Milestone } from "@/lib/chain-data";
import { TARGET_CHAIN_ID, deployment } from "@/lib/config";
import { formatDateTime, formatDuration, formatUsdc } from "@/lib/format";
import { useDonorPosition, useTransaction } from "@/lib/hooks";
import { AddressText } from "@/components/AddressText";
import { Notice } from "@/components/Notice";
import { useWalletReady } from "./useWalletReady";

/**
 * Contestation par un donateur pendant la fenêtre de contestation (Phase 2, §5.4).
 * Le contrat vérifie tout (donateur, fenêtre, contestation unique) ; ce panneau explique et pré-vérifie.
 */
export function DisputePanel({ m, detail }: { m: Milestone; detail: CampaignDetail }) {
  const { address, ready } = useWalletReady();
  const { writeContractAsync } = useWriteContract();
  const tx = useTransaction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const tracker = detail.summary.tracker;
  const deposit = detail.disputeDeposit;

  const { data: position } = useDonorPosition(detail.summary.vault, address);
  const { data: allowance, refetch } = useReadContract({
    chainId: TARGET_CHAIN_ID,
    address: deployment?.usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, tracker] : undefined,
    query: { enabled: !!address && !!deployment && deposit > 0n },
  });

  const windowEnd = m.approvedAt + detail.challengePeriod;
  const windowOpen = m.status === "Approved" && detail.chainNow < windowEnd;

  // Contestation existante : on l'affiche, quel que soit son état
  if (m.dispute) {
    const d = m.dispute;
    return (
      <div className="space-y-1 rounded-lg border border-line p-3 text-sm">
        <p className="font-medium">
          {d.resolved ? (d.upheld ? "Contestation retenue" : "Contestation rejetée") : "Contestation en cours d'examen"}
        </p>
        <p className="text-ink-muted">
          Ouverte le {formatDateTime(d.openedAt)} par <AddressText address={d.disputer} />
          {d.deposit > 0n && <> · caution {formatUsdc(d.deposit)}</>}
        </p>
        {!d.resolved && (
          <p className="text-ink-muted">
            Le paiement est bloqué jusqu&apos;à la décision d&apos;un arbitre indépendant. Sans décision avant la date
            limite et le délai de grâce, le jalon expire et les donateurs peuvent récupérer les fonds non dépensés.
          </p>
        )}
        {d.resolved && d.deposit > 0n && (
          <p className="text-ink-muted">
            {d.upheld ? "La caution a été rendue au donateur." : "La caution a été versée au prestataire."}
          </p>
        )}
      </div>
    );
  }

  if (!windowOpen) return null;

  const isDonor = !!position && position.donated > 0n;
  const needsApproval = deposit > 0n && (allowance ?? 0n) < deposit;
  const lowBalance = !!position && deposit > 0n && position.usdcBalance < deposit;

  async function approveDeposit() {
    const ok = await tx.run("approve", () =>
      writeContractAsync({
        chainId: TARGET_CHAIN_ID,
        address: deployment!.usdc,
        abi: erc20Abi,
        functionName: "approve",
        args: [tracker, deposit],
      }),
    );
    if (ok) await refetch();
  }

  async function submit() {
    const ok = await tx.run("dispute", () =>
      writeContractAsync({
        chainId: TARGET_CHAIN_ID,
        address: tracker,
        abi: milestoneTrackerAbi,
        functionName: "openDispute",
        args: [m.id, reason.trim()],
      }),
    );
    if (ok) {
      setOpen(false);
      setReason("");
    }
  }

  if (!ready || !isDonor) {
    return (
      <p className="text-xs text-ink-muted">
        Les donateurs de cette campagne peuvent contester ce jalon pendant encore{" "}
        {formatDuration(windowEnd - detail.chainNow)}.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-line p-3">
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            Vous avez donné à cette campagne : vous pouvez contester ce jalon pendant encore{" "}
            {formatDuration(windowEnd - detail.chainNow)}.
          </span>
          <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
            Contester…
          </button>
        </div>
      ) : (
        <>
          <Notice tone="warning">
            Une contestation bloque le paiement jusqu&apos;à la décision d&apos;un arbitre indépendant. Un jalon ne peut
            être contesté qu&apos;une seule fois.
            {deposit > 0n && (
              <>
                {" "}
                Caution : <strong>{formatUsdc(deposit)}</strong>, rendue si la contestation est retenue, versée au
                prestataire sinon.
              </>
            )}
          </Notice>
          <label htmlFor={`dispute-${tracker}-${m.id}`} className="block text-sm font-medium">
            Motif (public, sans données personnelles)
          </label>
          <textarea
            id={`dispute-${tracker}-${m.id}`}
            className="input min-h-16"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
          {lowBalance && <Notice tone="danger">Solde USDC insuffisant pour la caution.</Notice>}
          <div className="flex flex-wrap gap-2">
            {needsApproval ? (
              <button
                type="button"
                className="btn-primary"
                disabled={!!tx.pending || lowBalance}
                onClick={approveDeposit}
              >
                {tx.pending === "approve" ? "Autorisation…" : `1. Autoriser la caution (${formatUsdc(deposit)})`}
              </button>
            ) : (
              <button
                type="button"
                className="btn-warning"
                disabled={!reason.trim() || !!tx.pending || lowBalance}
                onClick={submit}
              >
                {tx.pending === "dispute" ? "Envoi…" : deposit > 0n ? "2. Contester le jalon" : "Contester le jalon"}
              </button>
            )}
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)} disabled={!!tx.pending}>
              Annuler
            </button>
          </div>
        </>
      )}
      {tx.error && <Notice tone="danger">{tx.error}</Notice>}
    </div>
  );
}
