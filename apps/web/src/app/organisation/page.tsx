"use client";

import { RoleGate } from "@/components/pro/RoleGate";
import { CreateCampaignForm, OrgCampaign } from "@/components/pro/OrgPanels";
import { Notice } from "@/components/Notice";
import { useAllCampaignDetails } from "@/lib/hooks";

export default function OrganisationPage() {
  const { data: details, isLoading, error } = useAllCampaignDetails();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Espace organisation</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Créez vos campagnes, définissez les jalons et soumettez les preuves. Vous ne pouvez ni approuver vos jalons,
          ni déplacer les fonds : seuls le prestataire et un auditeur indépendant débloquent un paiement.
        </p>
      </header>

      <RoleGate role="org">
        {(account) => {
          const mine = details?.filter((d) => d.summary.org.toLowerCase() === account.toLowerCase()) ?? [];
          return (
            <div className="space-y-6">
              <CreateCampaignForm />
              {error && <Notice tone="danger">Lecture impossible : {error.message}</Notice>}
              {isLoading && <p className="text-ink-muted">Chargement de vos campagnes…</p>}
              {details && mine.length === 0 && <p className="text-ink-muted">Vous n&apos;avez pas encore de campagne.</p>}
              {mine.map((d) => (
                <OrgCampaign key={d.summary.id.toString()} detail={d} />
              ))}
            </div>
          );
        }}
      </RoleGate>
    </div>
  );
}
