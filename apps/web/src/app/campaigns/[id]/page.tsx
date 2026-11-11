"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCampaign } from "@/lib/hooks";
import { formatDate, formatUsdc } from "@/lib/format";
import { AddressText } from "@/components/AddressText";
import { CampaignStateBadge } from "@/components/Badges";
import { FundingProgress } from "@/components/FundingProgress";
import { Notice } from "@/components/Notice";
import { DonatePanel } from "@/components/campaign/DonatePanel";
import { RefundPanel } from "@/components/campaign/RefundPanel";
import { MilestoneList } from "@/components/campaign/MilestoneList";

export default function CampaignPage() {
  const params = useParams<{ id: string }>();
  const id = /^\d+$/.test(params.id) ? BigInt(params.id) : null;
  const { data, isLoading, error } = useCampaign(id);

  if (id === null) return <Notice tone="danger">Identifiant de campagne invalide.</Notice>;
  if (error) return <Notice tone="danger">Campagne introuvable ou lecture impossible : {error.message}</Notice>;
  if (isLoading || !data) return <p className="text-ink-muted">Chargement de la campagne…</p>;

  const c = data.summary;
  const available = c.totalRaised - c.totalReleased - c.totalRefunded;

  return (
    <div className="space-y-8">
      <Link href="/" className="link text-sm">
        ← Toutes les campagnes
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{c.metadata?.name ?? `Campagne #${c.id}`}</h1>
          <CampaignStateBadge state={c.state} paused={c.paused} />
        </div>
        {c.metadata?.description && <p className="max-w-3xl text-ink-muted">{c.metadata.description}</p>}
        <p className="text-sm">
          <AddressText address={c.org} label="Organisation" />
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <section className="card space-y-5" aria-labelledby="funds-title">
            <h2 id="funds-title" className="sr-only">
              Fonds de la campagne
            </h2>
            <FundingProgress raised={c.totalRaised} softCap={c.softCap} hardCap={c.hardCap} />
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-ink-muted">Sous séquestre</dt>
                <dd className="font-medium">{formatUsdc(available)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Payé aux prestataires</dt>
                <dd className="font-medium">{formatUsdc(c.totalReleased)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Remboursé</dt>
                <dd className="font-medium">{formatUsdc(c.totalRefunded)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Fin de collecte</dt>
                <dd className="font-medium">{formatDate(c.fundingDeadline)}</dd>
              </div>
            </dl>
            <p className="text-xs text-ink-muted">
              Coffre <AddressText address={c.vault} /> · Suivi des jalons <AddressText address={c.tracker} />
            </p>
          </section>

          <section aria-labelledby="milestones-title" className="space-y-4">
            <div>
              <h2 id="milestones-title" className="text-lg font-semibold">
                Jalons
              </h2>
              <p className="text-sm text-ink-muted">
                Le prestataire et le montant de chaque jalon sont figés à sa création. Un paiement exige la
                confirmation du prestataire, l&apos;approbation d&apos;un auditeur indépendant, puis une fenêtre de
                contestation.
              </p>
            </div>
            <MilestoneList detail={data} />
          </section>
        </div>

        <aside className="space-y-4">
          {c.state === "Funding" && <DonatePanel campaign={c} />}
          {c.state !== "Funding" && (
            <section className="card text-sm text-ink-muted">
              {c.state === "Active" && "La collecte est terminée. Les fonds financent les jalons ci-contre."}
              {c.state === "Failed" && "L'objectif minimal n'a pas été atteint. Les donateurs peuvent être remboursés."}
              {c.state === "Halted" && "Un jalon a expiré. Les fonds non dépensés sont remboursables au prorata."}
              {c.state === "Completed" && "La campagne est clôturée. Le reliquat est remboursable au prorata."}
            </section>
          )}
          <RefundPanel campaign={c} />
        </aside>
      </div>
    </div>
  );
}
