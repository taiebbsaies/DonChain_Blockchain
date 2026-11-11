"use client";

import Link from "next/link";
import type { Address, PublicClient } from "viem";
import { usePublicClient, useSignTypedData, useWriteContract } from "wagmi";
import { milestoneTrackerAbi } from "@donchain/shared";
import type { CampaignDetail, Milestone } from "@/lib/chain-data";
import { TARGET_CHAIN_ID } from "@/lib/config";
import { buildConfirmDeliveryTypedData } from "@/lib/confirm-delivery";
import { formatDate, formatUsdc } from "@/lib/format";
import { useTransaction } from "@/lib/hooks";
import { MilestoneStatusBadge } from "@/components/Badges";
import { Notice } from "@/components/Notice";
import { ProofList } from "@/components/ProofList";

const SIGNATURE_VALIDITY = 3_600n; // la signature expire après 1 h

export function SupplierMilestone({ m, detail, account }: { m: Milestone; detail: CampaignDetail; account: Address }) {
  const client = usePublicClient({ chainId: TARGET_CHAIN_ID }) as PublicClient | undefined;
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();
  const tx = useTransaction();
  const tracker = detail.summary.tracker;
  const latestCid = m.proofs.at(-1)?.cid;
  const needsConfirmation = m.status === "Submitted" && !m.supplierConfirmed && !!latestCid;

  async function confirmDelivery() {
    if (!client || !latestCid) return;
    await tx.run("confirm", async () => {
      // Nonce et horloge lus au moment de signer : protection contre le rejeu (§9.2)
      const [nonce, block] = await Promise.all([
        client.readContract({ address: tracker, abi: milestoneTrackerAbi, functionName: "nonces", args: [account] }),
        client.getBlock(),
      ]);
      const deadline = block.timestamp + SIGNATURE_VALIDITY;
      const typedData = buildConfirmDeliveryTypedData({
        chainId: TARGET_CHAIN_ID,
        tracker,
        milestoneId: m.id,
        supplier: account,
        amount: m.amount,
        latestProofCid: latestCid,
        nonce,
        deadline,
      });
      const signature = await signTypedDataAsync(typedData);
      return writeContractAsync({
        chainId: TARGET_CHAIN_ID,
        address: tracker,
        abi: milestoneTrackerAbi,
        functionName: "confirmDelivery",
        args: [m.id, deadline, signature],
      });
    });
  }

  return (
    <li className="card space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-ink-muted">
            <Link href={`/campaigns/${detail.summary.id}`} className="link">
              {detail.summary.metadata?.name ?? `Campagne #${detail.summary.id}`}
            </Link>{" "}
            · Jalon {Number(m.id) + 1}
          </p>
          <p className="font-medium">{m.metadata?.title ?? "Sans intitulé"}</p>
          <p className="text-sm text-ink-muted">
            {formatUsdc(m.amount)} · avant le {formatDate(m.deadline)}
          </p>
        </div>
        <MilestoneStatusBadge status={m.status} />
      </div>

      <ProofList proofs={m.proofs} />

      {needsConfirmation && (
        <div className="space-y-3 rounded-lg bg-surface-muted p-3 text-sm">
          <p className="font-medium">Ce que vous allez signer</p>
          <p className="text-ink-muted">
            Vous confirmez avoir livré la prestation et accepter un paiement de{" "}
            <strong className="text-ink">{formatUsdc(m.amount)}</strong> sur la base de la preuve{" "}
            <span className="break-all font-mono text-xs">{latestCid}</span>. La signature est valable 1 heure et ne
            peut servir qu&apos;une fois, pour ce jalon et ce contrat. Le paiement exige ensuite l&apos;approbation
            d&apos;un auditeur.
          </p>
          <button type="button" className="btn-primary" disabled={!!tx.pending} onClick={confirmDelivery}>
            {tx.pending ? "Signature et envoi…" : "Signer et confirmer la livraison"}
          </button>
        </div>
      )}

      {m.status === "Submitted" && m.supplierConfirmed && (
        <p className="text-sm text-ink-muted">Livraison confirmée. En attente de l&apos;auditeur.</p>
      )}
      {m.status === "Approved" && (
        <p className="text-sm text-ink-muted">
          Approuvé. Le paiement sera possible après la fenêtre de contestation, depuis la page de la campagne.
        </p>
      )}
      {m.status === "Released" && <p className="text-sm text-success">Payé : {formatUsdc(m.amount)} reçus.</p>}

      {tx.error && <Notice tone="danger">{tx.error}</Notice>}
    </li>
  );
}
