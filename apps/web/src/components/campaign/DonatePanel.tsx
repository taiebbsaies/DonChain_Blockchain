"use client";

import { useState } from "react";
import { useWriteContract } from "wagmi";
import { donationVaultAbi, erc20Abi } from "@donchain/shared";
import type { CampaignSummary } from "@/lib/chain-data";
import { TARGET_CHAIN_ID, deployment, isLocalChain } from "@/lib/config";
import { formatUsdc, parseUsdc, shortAddress } from "@/lib/format";
import { useDonorPosition, useTransaction } from "@/lib/hooks";
import { Notice } from "@/components/Notice";
import { useWalletReady } from "./useWalletReady";

const FAUCET_AMOUNT = 1_000_000_000n; // 1 000 USDC (6 décimales)

export function DonatePanel({ campaign }: { campaign: CampaignSummary }) {
  const { address, ready } = useWalletReady();
  const { data: position } = useDonorPosition(campaign.vault, address);
  const { writeContractAsync } = useWriteContract();
  const tx = useTransaction();
  const [input, setInput] = useState("");

  const room = campaign.hardCap - campaign.totalRaised;
  const amount = parseUsdc(input);

  let problem: string | null = null;
  if (input && amount === null) problem = "Montant invalide (6 décimales maximum).";
  else if (amount !== null && amount < campaign.minDonation)
    problem = `Le don minimum est de ${formatUsdc(campaign.minDonation)}.`;
  else if (amount !== null && amount > room) problem = `Il reste ${formatUsdc(room)} avant l'objectif maximal.`;
  else if (amount !== null && position && amount > position.usdcBalance)
    problem = `Solde insuffisant (${formatUsdc(position.usdcBalance)}).`;

  const valid = amount !== null && amount > 0n && !problem;
  const needsApproval = valid && position !== undefined && position.allowance < amount;

  async function approve() {
    if (!deployment || amount === null) return;
    const usdc = deployment.usdc;
    await tx.run("approve", () =>
      writeContractAsync({
        chainId: TARGET_CHAIN_ID,
        address: usdc,
        abi: erc20Abi,
        functionName: "approve",
        args: [campaign.vault, amount],
      }),
    );
  }

  async function donate() {
    if (amount === null) return;
    const ok = await tx.run("donate", () =>
      writeContractAsync({
        chainId: TARGET_CHAIN_ID,
        address: campaign.vault,
        abi: donationVaultAbi,
        functionName: "donate",
        args: [amount],
      }),
    );
    if (ok) setInput("");
  }

  async function faucet() {
    if (!deployment || !address) return;
    const usdc = deployment.usdc;
    await tx.run("faucet", () =>
      writeContractAsync({
        chainId: TARGET_CHAIN_ID,
        address: usdc,
        abi: erc20Abi,
        functionName: "mint",
        args: [address, FAUCET_AMOUNT],
      }),
    );
  }

  return (
    <section className="card space-y-4" aria-labelledby="donate-title">
      <h2 id="donate-title" className="font-semibold">
        Faire un don
      </h2>

      {campaign.paused ? (
        <Notice tone="warning">Les dons sont suspendus temporairement. Les remboursements restent possibles.</Notice>
      ) : (
        <>
          <div>
            <label htmlFor="amount" className="mb-1.5 block text-sm font-medium">
              Montant (USDC)
            </label>
            <input
              id="amount"
              className="input"
              inputMode="decimal"
              autoComplete="off"
              placeholder={`Minimum ${formatUsdc(campaign.minDonation)}`}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                tx.clearError();
              }}
              aria-invalid={!!problem}
              aria-describedby="amount-help"
            />
            <p id="amount-help" className={`mt-1.5 text-xs ${problem ? "text-danger" : "text-ink-muted"}`}>
              {problem ??
                (position ? `Solde : ${formatUsdc(position.usdcBalance)}` : "Connectez un portefeuille pour donner.")}
            </p>
          </div>

          {valid && amount !== null && (
            <div className="rounded-lg bg-surface-muted p-3 text-xs text-ink-muted">
              <p className="mb-1 font-medium text-ink">Ce que vous allez signer</p>
              {needsApproval ? (
                <p>
                  1. Autoriser le coffre {shortAddress(campaign.vault)} à prélever {formatUsdc(amount)}. 2. Déposer ce
                  montant dans le coffre.
                </p>
              ) : (
                <p>
                  Déposer {formatUsdc(amount)} dans le coffre {shortAddress(campaign.vault)}. Vous recevez un reçu non
                  transférable. Les fonds ne peuvent sortir que vers un prestataire validé, ou vers vous en cas de
                  remboursement.
                </p>
              )}
            </div>
          )}

          {needsApproval ? (
            <button type="button" className="btn-primary w-full" disabled={!ready || !!tx.pending} onClick={approve}>
              {tx.pending === "approve" ? "Autorisation…" : "1. Autoriser l'USDC"}
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary w-full"
              disabled={!ready || !valid || !!tx.pending}
              onClick={donate}
            >
              {tx.pending === "donate" ? "Envoi du don…" : "Donner"}
            </button>
          )}

          {isLocalChain && ready && (
            <button type="button" className="btn-ghost w-full text-xs" disabled={!!tx.pending} onClick={faucet}>
              {tx.pending === "faucet" ? "Envoi…" : "Recevoir 1 000 USDC de test (réseau local)"}
            </button>
          )}
        </>
      )}

      {tx.error && <Notice tone="danger">{tx.error}</Notice>}
    </section>
  );
}
