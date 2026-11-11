"use client";

import { useWriteContract } from "wagmi";
import { donationVaultAbi } from "@donchain/shared";
import type { CampaignSummary } from "@/lib/chain-data";
import { TARGET_CHAIN_ID } from "@/lib/config";
import { formatUsdc } from "@/lib/format";
import { useDonorPosition, useTransaction } from "@/lib/hooks";
import { Notice } from "@/components/Notice";
import { useWalletReady } from "./useWalletReady";

const REASONS: Partial<Record<CampaignSummary["state"], string>> = {
  Failed: "L'objectif minimal n'a pas été atteint : vous récupérez l'intégralité de votre don.",
  Halted: "Un jalon a expiré : la campagne est interrompue et les fonds non dépensés sont rendus au prorata.",
  Completed: "La campagne est clôturée : le reliquat non dépensé est rendu au prorata.",
};

/** Position du donateur sur la campagne et bouton de remboursement (pattern pull). */
export function RefundPanel({ campaign }: { campaign: CampaignSummary }) {
  const { address, ready } = useWalletReady();
  const { data: position } = useDonorPosition(campaign.vault, address);
  const { writeContractAsync } = useWriteContract();
  const tx = useTransaction();

  if (!address || !position || position.donated === 0n) return null;

  async function refund() {
    await tx.run("refund", () =>
      writeContractAsync({
        chainId: TARGET_CHAIN_ID,
        address: campaign.vault,
        abi: donationVaultAbi,
        functionName: "refund",
      }),
    );
  }

  return (
    <section className="card space-y-3" aria-labelledby="position-title">
      <h2 id="position-title" className="font-semibold">
        Votre participation
      </h2>
      <p className="text-sm">
        Vous avez donné <strong>{formatUsdc(position.donated)}</strong> à cette campagne.
      </p>

      {position.refunded && <Notice>Votre remboursement a déjà été versé.</Notice>}

      {position.refundable > 0n && (
        <>
          <p className="text-sm text-ink-muted">{REASONS[campaign.state]}</p>
          <button type="button" className="btn-primary w-full" disabled={!ready || !!tx.pending} onClick={refund}>
            {tx.pending ? "Remboursement…" : `Récupérer ${formatUsdc(position.refundable)}`}
          </button>
        </>
      )}

      {tx.error && <Notice tone="danger">{tx.error}</Notice>}
    </section>
  );
}
