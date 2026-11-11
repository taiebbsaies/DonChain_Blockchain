"use client";

import Link from "next/link";
import { useCampaigns } from "@/lib/hooks";
import { deployment, targetChain } from "@/lib/config";
import { formatDate } from "@/lib/format";
import { CampaignStateBadge } from "@/components/Badges";
import { FundingProgress } from "@/components/FundingProgress";
import { Notice } from "@/components/Notice";

export default function CampaignsPage() {
  const { data: campaigns, isLoading, error } = useCampaigns();

  return (
    <div className="space-y-8">
      <section className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Des dons que l&apos;on peut suivre</h1>
        <p className="mt-3 text-ink-muted">
          Chaque don reste sous séquestre jusqu&apos;à ce qu&apos;un jalon soit confirmé par le prestataire et
          approuvé par un auditeur indépendant. Si la campagne échoue, vous récupérez votre don.
        </p>
      </section>

      {!deployment && (
        <Notice tone="warning">
          Aucun contrat n&apos;est configuré pour {targetChain.name}. Lancez le script de démo puis{" "}
          <code>pnpm --filter @donchain/shared generate</code>.
        </Notice>
      )}
      {error && <Notice tone="danger">Lecture de la blockchain impossible : {error.message}</Notice>}

      {isLoading && <p className="text-ink-muted">Chargement des campagnes…</p>}

      {campaigns && campaigns.length === 0 && <p className="text-ink-muted">Aucune campagne pour le moment.</p>}

      {campaigns && campaigns.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <li key={c.id.toString()}>
              <Link
                href={`/campaigns/${c.id}`}
                className="card flex h-full flex-col gap-4 transition hover:border-brand/50 focus-visible:outline-2 focus-visible:outline-brand"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold leading-snug">{c.metadata?.name ?? `Campagne #${c.id}`}</h2>
                  <CampaignStateBadge state={c.state} paused={c.paused} />
                </div>
                {c.metadata?.description && (
                  <p className="line-clamp-2 text-sm text-ink-muted">{c.metadata.description}</p>
                )}
                <div className="mt-auto space-y-2">
                  <FundingProgress raised={c.totalRaised} softCap={c.softCap} hardCap={c.hardCap} compact />
                  <p className="text-xs text-ink-muted">Fin de collecte le {formatDate(c.fundingDeadline)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
