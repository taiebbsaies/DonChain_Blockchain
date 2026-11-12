"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiEnabled, exportUrl, fetchApiHealth, fetchFlows, type FlowRow } from "@/lib/api";
import { formatDateTime, formatUsdc } from "@/lib/format";
import { AddressText } from "@/components/AddressText";
import { Notice } from "@/components/Notice";
import { targetChain } from "@/lib/config";

const EXPLORER = targetChain.blockExplorers?.default.url;

const CATEGORY: Record<FlowRow["category"], { label: string; tone: string; sign: string }> = {
  donation: { label: "Entrée", tone: "tone-success", sign: "+" },
  release: { label: "Paiement", tone: "tone-info", sign: "−" },
  refund: { label: "Remboursement", tone: "tone-warning", sign: "−" },
  deposit: { label: "Caution", tone: "tone-neutral", sign: "" },
  milestone: { label: "Jalon", tone: "tone-neutral", sign: "" },
  campaign: { label: "Campagne", tone: "tone-neutral", sign: "" },
};

/** Explorateur public du flux des fonds (§4.5), servi par l'indexeur de l'API. */
export default function FlowsPage() {
  const params = useParams<{ id: string }>();
  const id = /^\d+$/.test(params.id) ? BigInt(params.id) : null;
  const flows = useQuery({
    queryKey: ["flows", id?.toString()],
    queryFn: () => fetchFlows(id!),
    enabled: apiEnabled && id !== null,
  });
  const health = useQuery({ queryKey: ["api-health"], queryFn: fetchApiHealth, enabled: apiEnabled });

  if (id === null) return <Notice tone="danger">Identifiant de campagne invalide.</Notice>;

  return (
    <div className="space-y-6">
      <Link href={`/campaigns/${id}`} className="link text-sm">
        ← Retour à la campagne
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Flux des fonds · campagne #{id.toString()}</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Chaque ligne est un événement de la blockchain : dons, paiements, remboursements et étapes de validation.
            {EXPLORER
              ? " Cliquez sur une transaction pour la vérifier vous-même sur l'explorateur public."
              : " Chaque transaction est vérifiable sur le nœud de la chaîne."}
          </p>
        </div>
        {apiEnabled && (
          <div className="flex gap-2">
            <a className="btn-secondary text-sm" href={exportUrl(id, "csv")}>
              Export CSV
            </a>
            <a className="btn-secondary text-sm" href={exportUrl(id, "pdf")}>
              Relevé PDF
            </a>
          </div>
        )}
      </header>

      {!apiEnabled && (
        <Notice>
          L&apos;explorateur nécessite l&apos;API DonChain (variable <code>NEXT_PUBLIC_API_URL</code>). La page de la
          campagne reste consultable directement depuis la chaîne.
        </Notice>
      )}
      {health.data?.lag !== null && health.data?.lag !== undefined && health.data.lag > 5 && (
        <Notice tone="warning">L&apos;index a {health.data.lag} blocs de retard sur la chaîne.</Notice>
      )}
      {flows.error && <Notice tone="danger">Lecture impossible : {flows.error.message}</Notice>}
      {flows.isLoading && <p className="text-ink-muted">Chargement…</p>}

      {flows.data && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Événement</th>
                <th className="px-4 py-2 font-medium">Adresse</th>
                <th className="px-4 py-2 text-right font-medium">Montant</th>
                <th className="px-4 py-2 font-medium">Transaction</th>
              </tr>
            </thead>
            <tbody>
              {flows.data.map((f) => {
                const c = CATEGORY[f.category];
                const moves = f.category === "donation" || f.category === "release" || f.category === "refund";
                return (
                  <tr key={`${f.txHash}-${f.logIndex}`} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 text-ink-muted">{formatDateTime(f.time)}</td>
                    <td className="px-4 py-2">
                      <span className={`badge ${c.tone}`}>{c.label}</span>
                    </td>
                    <td className="px-4 py-2">
                      {f.label}
                      {f.milestoneId !== null && <span className="text-ink-muted"> · jalon {f.milestoneId + 1}</span>}
                    </td>
                    <td className="px-4 py-2">{f.party ? <AddressText address={f.party as `0x${string}`} /> : "—"}</td>
                    <td className={`whitespace-nowrap px-4 py-2 text-right ${moves ? "font-medium" : "text-ink-muted"}`}>
                      {f.amount ? `${moves ? c.sign : ""}${formatUsdc(BigInt(f.amount))}` : ""}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-ink-muted" title={f.txHash}>
                      {EXPLORER ? (
                        <a className="link" href={`${EXPLORER}/tx/${f.txHash}`} target="_blank" rel="noreferrer">
                          {f.txHash.slice(0, 10)}…
                        </a>
                      ) : (
                        `${f.txHash.slice(0, 10)}…`
                      )}{" "}
                      · bloc {f.block}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
