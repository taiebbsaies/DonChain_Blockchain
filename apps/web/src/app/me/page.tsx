"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { useCampaigns, useReceipts } from "@/lib/hooks";
import { formatDateTime, formatUsdc } from "@/lib/format";
import { Notice } from "@/components/Notice";
import { CampaignStateBadge } from "@/components/Badges";

export default function MyDonationsPage() {
  const { address } = useAccount();
  const { data: receipts, isLoading, error } = useReceipts(address);
  const { data: campaigns } = useCampaigns();

  const byVault = new Map(campaigns?.map((c) => [c.vault.toLowerCase(), c]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Mes dons</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Chaque don vous donne un reçu non transférable (SBT) qui enregistre la campagne, le montant et la date. Il ne
          contient aucune donnée personnelle et n&apos;a pas de valeur fiscale.
        </p>
      </header>

      {!address && <Notice>Connectez votre portefeuille pour voir vos dons.</Notice>}
      {error && <Notice tone="danger">Lecture des reçus impossible : {error.message}</Notice>}
      {address && isLoading && <p className="text-ink-muted">Chargement de vos reçus…</p>}
      {receipts && receipts.length === 0 && (
        <p className="text-ink-muted">
          Aucun don pour cette adresse.{" "}
          <Link href="/" className="link">
            Voir les campagnes
          </Link>
        </p>
      )}

      {receipts && receipts.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Reçus de dons</caption>
            <thead className="border-b border-line text-ink-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">
                  Reçu
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Campagne
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Montant
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Date
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  État
                </th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => {
                const c = byVault.get(r.campaign.toLowerCase());
                return (
                  <tr key={r.tokenId.toString()} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-mono text-xs">#{r.tokenId.toString()}</td>
                    <td className="px-5 py-3">
                      {c ? (
                        <Link href={`/campaigns/${c.id}`} className="link">
                          {c.metadata?.name ?? `Campagne #${c.id}`}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs">{r.campaign}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-medium">{formatUsdc(r.amount)}</td>
                    <td className="px-5 py-3 text-ink-muted">{formatDateTime(r.timestamp)}</td>
                    <td className="px-5 py-3">{c && <CampaignStateBadge state={c.state} paused={c.paused} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {receipts && receipts.length > 0 && (
        <p className="text-xs text-ink-muted">
          Pour demander un remboursement, ouvrez la campagne concernée : le bouton apparaît dès que la campagne est
          échouée, interrompue ou clôturée.
        </p>
      )}
    </div>
  );
}
